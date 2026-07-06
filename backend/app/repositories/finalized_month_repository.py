import uuid

from sqlalchemy import select

from app.models.system import FinalizedMonth
from app.repositories.base import BaseRepository


class FinalizedMonthRepository(BaseRepository[FinalizedMonth]):
    model = FinalizedMonth

    async def get_for_period(self, project_id: uuid.UUID, year: int, month: int) -> FinalizedMonth | None:
        result = await self.session.execute(
            select(FinalizedMonth).where(
                FinalizedMonth.project_id == project_id,
                FinalizedMonth.year == year,
                FinalizedMonth.month == month,
            )
        )
        return result.scalar_one_or_none()
