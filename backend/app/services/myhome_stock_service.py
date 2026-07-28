import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import MonthLocked
from app.models.transactions import MyHomeStock
from app.repositories.month_lock_repository import MonthLockRepository
from app.repositories.myhome_stock_repository import MyHomeStockRepository
from app.schemas.transactions import MyHomeStockCreate
from app.services.audit_service import AuditService


class MyHomeStockService:
    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = MyHomeStockRepository(session, project_id=project_id)
        self._locks = MonthLockRepository(session)
        self._audit = AuditService(session)

    async def create(self, payload: MyHomeStockCreate) -> MyHomeStock:
        if await self._locks.is_finalized(
            self._project_id, payload.effective_date.year, payload.effective_date.month
        ):
            raise MonthLocked(payload.effective_date.year, payload.effective_date.month)

        stock = MyHomeStock(**payload.model_dump(), created_by=self._user_id)
        await self._repo.add(stock)
        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="myhome_stock",
            row_id=stock.id,
            action="CREATE",
            after_json={"dia_grade_id": str(stock.dia_grade_id), "qty_kg": str(stock.qty_kg)},
        )
        await self._session.commit()
        return stock
