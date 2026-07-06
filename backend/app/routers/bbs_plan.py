from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.repositories.bbs_plan_repository import BbsPlanRepository
from app.schemas.transactions import BbsPlanCreate, BbsPlanResponse
from app.services.bbs_plan_service import BbsPlanService

router = APIRouter(prefix="/api/v1/bbs-plans", tags=["bbs-plans"])


@router.get("", response_model=list[BbsPlanResponse])
async def list_bbs_plans(project_id: ProjectScope, session: ScopedSession) -> list[BbsPlanResponse]:
    items, _total = await BbsPlanRepository(session, project_id=project_id).list(limit=500)
    return [BbsPlanResponse.model_validate(i) for i in items]


@router.post("", response_model=BbsPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_bbs_plan(
    payload: BbsPlanCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> BbsPlanResponse:
    user_id, _role = current_user
    service = BbsPlanService(session, project_id, user_id)
    plan = await service.create(payload)
    return BbsPlanResponse.model_validate(plan)
