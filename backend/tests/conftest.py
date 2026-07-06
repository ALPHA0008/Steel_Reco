"""Session-scoped testcontainers Postgres + real Alembic migrations (plan §8:
'RLS, constraints, and the aggregation SQL all need a real Postgres -- SQLite
can't stand in'). Every integration test hits this real, ephemeral database --
not mocks -- because the whole point of this system is DB-enforced guarantees
(RLS, CHECK constraints, the issue>stock invariant) that a fake can't exercise.

IMPORTANT: no module in this file or in tests/integration/*.py may import
anything from `app.*` at module level. pytest imports (collects) every test
module BEFORE running any fixture, including this session-scoped one -- an
eager `from app.database import ...` at module level would create the async
engine against whatever DATABASE_URL happens to be in .env at collection
time (the dev docker-compose database), not this container. Every app.*
import below is therefore inside a function body, executed lazily at fixture/
test run time, after _postgres_env has already set the environment.
"""

import os
import sys
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from testcontainers.postgres import PostgresContainer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_container: PostgresContainer | None = None
_APP_ROLE_PASSWORD = "dev_app_password"  # matches migration 0003's hardcoded value


def _async_url(container: PostgresContainer, *, user: str | None = None, password: str | None = None) -> str:
    # testcontainers' get_connection_url() returns a psycopg2-style URL;
    # asyncpg needs the +asyncpg driver marker. user/password override lets
    # us build the steel_recon_app URL from the same host/port/db.
    sync_url = container.get_connection_url()
    url = sync_url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
    if user is not None:
        from sqlalchemy.engine import make_url

        url_obj = make_url(url).set(username=user, password=password)
        # str(URL)/repr(URL) masks the password with a literal "***" for safe
        # logging (SQLAlchemy 1.4+) -- caught live as InvalidPasswordError,
        # since the connection string ended up containing "***" as the actual
        # password. render_as_string(hide_password=False) is required to get
        # a real, usable connection string back out.
        url = url_obj.render_as_string(hide_password=False)
    return url


@pytest.fixture(scope="session", autouse=True)
def _postgres_env():
    """Starts ONE Postgres container for the whole session, runs the real
    Alembic migration chain (0001-0004) as the container's superuser, then
    points the APP's runtime DATABASE_URL at the restricted steel_recon_app
    role migration 0003 creates -- not the superuser. Superusers bypass RLS
    entirely (plan §12's Foundation finding); running tests as the superuser
    would make every RLS test pass for the wrong reason (bypass, not
    enforcement), exactly the bug that finding was about.
    """
    global _container
    _container = PostgresContainer("postgres:16-alpine")
    _container.start()

    superuser_url = _async_url(_container)
    app_role_url = _async_url(_container, user="steel_recon_app", password=_APP_ROLE_PASSWORD)

    os.environ["MIGRATION_DATABASE_URL"] = superuser_url
    os.environ["DATABASE_URL"] = app_role_url
    os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-for-production"

    from alembic import command
    from alembic.config import Config

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    command.upgrade(alembic_cfg, "head")

    yield

    _container.stop()


@pytest_asyncio.fixture
async def db_session():
    """A session on the RESTRICTED steel_recon_app role -- RLS applies to
    every query through this fixture, same as a real request.
    """
    from app.database import async_session_factory

    async with async_session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def superuser_session():
    """A session on the migration superuser -- used ONLY for test setup that
    must bypass RLS (seeding a project, which requires admin role anyway, or
    asserting on rows across tenants that a scoped session couldn't see).
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine(os.environ["MIGRATION_DATABASE_URL"])
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def app_client():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def seeded_project(superuser_session):
    """One project + one QS user + assignment -- mirrors scripts/seed_dev.py.
    Runs on the superuser session since creating a project requires the
    admin-only RLS INSERT policy (plan §3.3); everything else in a test
    should go through db_session (the restricted role) or app_client (HTTP).
    """
    from sqlalchemy import text

    from app.models.structure import Project
    from app.models.system import ProjectAssignment, User
    from app.security import create_access_token, hash_password

    await superuser_session.execute(text("SET app.user_role = 'admin'"))

    project = Project(name=f"Test Project {uuid.uuid4().hex[:8]}", location="Test Site")
    superuser_session.add(project)
    await superuser_session.flush()

    user = User(
        username=f"qs_{uuid.uuid4().hex[:8]}",
        email=f"{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("test-password-123"),
        full_name="Test QS",
        role="QS",
    )
    superuser_session.add(user)
    await superuser_session.flush()

    superuser_session.add(ProjectAssignment(user_id=user.id, project_id=project.id, is_primary=True))
    await superuser_session.commit()

    token = create_access_token(subject=str(user.id), role="QS")
    return {"project": project, "user": user, "token": token}


@pytest.fixture
def auth_headers(seeded_project):
    return {"Authorization": f"Bearer {seeded_project['token']}"}
