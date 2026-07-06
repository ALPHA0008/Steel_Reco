import uuid

from sqlalchemy import select

from app.models.structure import Element, Floor, Project, Tower
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    model = Project

    async def get_accessible(self) -> list[Project]:
        """RLS on `projects` already restricts this to what the caller can see
        (plan §3.3) -- no project_id filter applies here since Project *is*
        the tenant root, not a project-scoped child table.
        """
        result = await self.session.execute(select(Project).order_by(Project.name))
        return list(result.scalars().all())


class TowerRepository(BaseRepository[Tower]):
    model = Tower

    async def list_for_project(self) -> list[Tower]:
        result = await self.session.execute(
            self._scoped_select().order_by(Tower.sequence, Tower.name)
        )
        return list(result.scalars().all())


class FloorRepository(BaseRepository[Floor]):
    model = Floor

    async def list_for_tower(self, tower_id: uuid.UUID) -> list[Floor]:
        result = await self.session.execute(
            self._scoped_select().where(Floor.tower_id == tower_id).order_by(Floor.sequence)
        )
        return list(result.scalars().all())


class ElementRepository(BaseRepository[Element]):
    model = Element

    async def list_for_floor(self, floor_id: uuid.UUID) -> list[Element]:
        result = await self.session.execute(
            self._scoped_select().where(Element.floor_id == floor_id).order_by(Element.name)
        )
        return list(result.scalars().all())
