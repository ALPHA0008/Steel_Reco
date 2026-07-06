import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import MonthLocked
from app.models.transactions import InterSiteTransfer
from app.repositories.inter_site_transfer_repository import InterSiteTransferRepository
from app.repositories.month_lock_repository import MonthLockRepository
from app.schemas.transactions import InterSiteTransferCreate
from app.services.audit_service import AuditService


class InterSiteTransferService:
    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = InterSiteTransferRepository(session, project_id=project_id)
        self._locks = MonthLockRepository(session)
        self._audit = AuditService(session)

    async def create(self, payload: InterSiteTransferCreate) -> InterSiteTransfer:
        if await self._locks.is_finalized(
            self._project_id, payload.effective_date.year, payload.effective_date.month
        ):
            raise MonthLocked(payload.effective_date.year, payload.effective_date.month)

        transfer = InterSiteTransfer(
            **payload.model_dump(),
            from_project_id=self._project_id,
            created_by=self._user_id,
        )
        await self._repo.add(transfer)
        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="inter_site_transfer",
            row_id=transfer.id,
            action="CREATE",
            after_json={
                "to_project_id": str(transfer.to_project_id),
                "dia_grade_id": str(transfer.dia_grade_id),
                "quantity_kg": str(transfer.quantity_kg),
                "flag": transfer.flag,
            },
        )
        await self._session.commit()
        return transfer
