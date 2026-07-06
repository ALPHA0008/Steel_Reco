import uuid
from typing import Generic, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base

TModel = TypeVar("TModel", bound=Base)


class BaseRepository(Generic[TModel]):
    """The only layer that touches SQLAlchemy directly (plan §5.1). Every
    repository is constructed with the session (already RLS-scoped by
    app.dependencies.get_scoped_session) and, for project-scoped models, the
    resolved project_id (from app.dependencies.verify_project_access).

    RLS at the DB is the real enforcement (plan §3.3/§5.4); the project_id
    filter here is defense-in-depth so a bug in a repository method can't
    accidentally omit tenant scoping even before hitting the DB.
    """

    model: type[TModel]
    eager_options: tuple = ()
    """selectinload(...)/joinedload(...) options for relationships a subclass
    needs eagerly loaded. Async SQLAlchemy cannot lazy-load a relationship
    outside the greenlet that owns the session -- discovered live: accessing
    PhysicalCount.cut_pieces from Pydantic's from_attributes serialization
    (which runs after the request's async context) raised MissingGreenlet.
    """

    def __init__(self, session: AsyncSession, project_id: uuid.UUID | None = None) -> None:
        self.session = session
        self.project_id = project_id

    def _scoped_select(self):
        stmt = select(self.model).options(*self.eager_options)
        if self.project_id is not None and hasattr(self.model, "project_id"):
            stmt = stmt.where(self.model.project_id == self.project_id)
        return stmt

    async def get(self, row_id: uuid.UUID) -> TModel | None:
        stmt = self._scoped_select().where(self.model.id == row_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list(self, *, skip: int = 0, limit: int = 100) -> tuple[list[TModel], int]:
        stmt = self._scoped_select()
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        stmt = stmt.order_by(self.model.created_at.desc()).offset(skip).limit(limit)
        items = (await self.session.execute(stmt)).scalars().all()
        return list(items), total

    async def add(self, instance: TModel) -> TModel:
        if self.project_id is not None and hasattr(instance, "project_id"):
            instance.project_id = self.project_id
        self.session.add(instance)
        await self.session.flush()
        return instance
