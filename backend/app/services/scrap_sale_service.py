import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import MonthLocked
from app.models.transactions import ScrapSale
from app.repositories.month_lock_repository import MonthLockRepository
from app.repositories.scrap_sale_repository import ScrapSaleRepository
from app.schemas.transactions import ScrapSaleCreate
from app.services.audit_service import AuditService


class ScrapSaleService:
    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = ScrapSaleRepository(session, project_id=project_id)
        self._locks = MonthLockRepository(session)
        self._audit = AuditService(session)

    async def create(self, payload: ScrapSaleCreate) -> ScrapSale:
        if await self._locks.is_finalized(
            self._project_id, payload.effective_date.year, payload.effective_date.month
        ):
            raise MonthLocked(payload.effective_date.year, payload.effective_date.month)

        sale = ScrapSale(**payload.model_dump(), created_by=self._user_id)
        await self._repo.add(sale)
        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="scrap_sale",
            row_id=sale.id,
            action="CREATE",
            after_json={"buyer_name": sale.buyer_name, "weight_kg": str(sale.weight_kg)},
        )
        await self._session.commit()
        return sale
