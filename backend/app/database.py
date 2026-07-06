from collections.abc import AsyncIterator
from datetime import datetime

from sqlalchemy import TIMESTAMP, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    # Every bare Mapped[datetime] column defaults to TIMESTAMPTZ, not naive
    # TIMESTAMP. Discovered live: SQLAlchemy's untyped default for `datetime`
    # is a naive TIMESTAMP; every Python-side write in this codebase uses
    # datetime.now(timezone.utc), and asyncpg hard-errors mixing aware/naive
    # ("can't subtract offset-naive and offset-aware datetimes") the moment
    # such a value is written to a naive column. This map fixes it globally
    # instead of requiring every mapped_column() call site to specify it.
    type_annotation_map = {datetime: TIMESTAMP(timezone=True)}


async def set_rls_context(session: AsyncSession, *, user_id: str | None, user_role: str) -> None:
    """Sets the per-request session GUCs that every RLS policy reads (plan §3.3).

    Must be called at the start of every request-scoped session, before any
    query touches an RLS-protected table — otherwise policies see NULL/unset
    values and (per the policy definitions) return zero rows rather than
    leaking data, so a missing call fails closed, not open.
    """
    await session.execute(text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": user_id or ""})
    await session.execute(text("SELECT set_config('app.user_role', :role, true)"), {"role": user_role})


async def get_session() -> AsyncIterator[AsyncSession]:
    """Bare session dependency with NO RLS context set — used only for
    unauthenticated routes (e.g. login). Every other route must use
    app.dependencies.get_scoped_session instead.
    """
    async with async_session_factory() as session:
        yield session
