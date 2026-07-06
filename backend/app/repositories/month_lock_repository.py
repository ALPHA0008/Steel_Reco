import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system import FinalizedMonth


class MonthLockRepository:
    """is_finalized() is called as step 1 of every transaction service's
    write path (plan §5.3) -- every write checks this before doing anything
    else, so a locked period can't be bypassed by any write path.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def is_finalized(self, project_id: uuid.UUID, year: int, month: int) -> bool:
        result = await self.session.execute(
            select(FinalizedMonth.status).where(
                FinalizedMonth.project_id == project_id,
                FinalizedMonth.year == year,
                FinalizedMonth.month == month,
            )
        )
        status = result.scalar_one_or_none()
        return status == "locked"

    async def get(self, project_id: uuid.UUID, year: int, month: int) -> FinalizedMonth | None:
        result = await self.session.execute(
            select(FinalizedMonth).where(
                FinalizedMonth.project_id == project_id,
                FinalizedMonth.year == year,
                FinalizedMonth.month == month,
            )
        )
        return result.scalar_one_or_none()
