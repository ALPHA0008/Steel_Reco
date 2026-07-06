import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import MonthLocked
from app.models.transactions import JmrActual
from app.repositories.jmr_actual_repository import JmrActualRepository
from app.repositories.month_lock_repository import MonthLockRepository
from app.schemas.transactions import JmrActualCreate
from app.services.audit_service import AuditService


class JmrActualService:
    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = JmrActualRepository(session, project_id=project_id)
        self._locks = MonthLockRepository(session)
        self._audit = AuditService(session)

    async def create(self, payload: JmrActualCreate) -> JmrActual:
        if await self._locks.is_finalized(
            self._project_id, payload.effective_date.year, payload.effective_date.month
        ):
            raise MonthLocked(payload.effective_date.year, payload.effective_date.month)

        actual = JmrActual(**payload.model_dump(), created_by=self._user_id)
        await self._repo.add(actual)
        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="jmr_actual",
            row_id=actual.id,
            action="CREATE",
            after_json={
                "tower_id": str(actual.tower_id),
                "floor_id": str(actual.floor_id),
                "dia_grade_id": str(actual.dia_grade_id),
                "measured_weight_kg": str(actual.measured_weight_kg),
            },
        )
        await self._session.commit()
        return actual
