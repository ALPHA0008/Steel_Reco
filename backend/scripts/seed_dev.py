"""One-off dev seeding script -- creates a test project + QS user + assignment
so the Foundation can be verified end-to-end via real HTTP requests.
Connects via the migration (superuser) URL since RLS INSERT policies require
app.current_user_id to already exist, which is circular for the very first user.
"""

import asyncio
import sys

sys.path.insert(0, ".")

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.config import settings
from app.models.structure import Project
from app.models.system import ProjectAssignment, User
from app.security import hash_password


async def main() -> None:
    engine = create_async_engine(settings.migration_database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        project = Project(name="My Home APAS", location="Kokapet, Hyderabad")
        session.add(project)
        await session.flush()

        user = User(
            username="qs_apas",
            email="qs.apas@myhome.example",
            password_hash=hash_password("dev-password-123"),
            full_name="Test QS",
            role="QS",
        )
        session.add(user)
        await session.flush()

        session.add(ProjectAssignment(user_id=user.id, project_id=project.id, is_primary=True))
        await session.commit()

        print(f"Seeded project {project.id} ({project.name})")
        print(f"Seeded user {user.id} ({user.username}) -- password: dev-password-123")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
