import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transactions import BbsPlan
from app.repositories.bbs_plan_repository import BbsPlanRepository
from app.schemas.transactions import BbsPlanCreate
from app.services.audit_service import AuditService


class BbsPlanService:
    """No month-lock check: BBS plans are engineering estimates, not dated
    ledger events (no effective_date field) -- they can be entered/revised
    any time and are only ever compared against actuals in the Abstract query.
    """

    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = BbsPlanRepository(session, project_id=project_id)
        self._audit = AuditService(session)

    async def create(self, payload: BbsPlanCreate) -> BbsPlan:
        plan = BbsPlan(**payload.model_dump(), created_by=self._user_id)
        await self._repo.add(plan)
        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="bbs_plan",
            row_id=plan.id,
            action="CREATE",
            after_json={
                "tower_id": str(plan.tower_id),
                "floor_id": str(plan.floor_id),
                "dia_grade_id": str(plan.dia_grade_id),
                "planned_weight_kg": str(plan.planned_weight_kg),
            },
        )
        await self._session.commit()
        return plan
