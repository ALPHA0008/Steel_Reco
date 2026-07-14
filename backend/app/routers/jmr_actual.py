from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.repositories.jmr_actual_repository import JmrActualRepository
from app.schemas.transactions import JmrActualCreate, JmrActualResponse
from app.services.jmr_actual_service import JmrActualService

router = APIRouter(prefix="/api/v1/jmr-actuals", tags=["jmr-actuals"])


@router.get("", response_model=list[JmrActualResponse])
async def list_jmr_actuals(project_id: ProjectScope, session: ScopedSession) -> list[JmrActualResponse]:
    items, _total = await JmrActualRepository(session, project_id=project_id).list(limit=500)
    return [JmrActualResponse.model_validate(i) for i in items]


@router.post("", response_model=JmrActualResponse, status_code=status.HTTP_201_CREATED)
async def create_jmr_actual(
    payload: JmrActualCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> JmrActualResponse:
    user_id, _role = current_user
    service = JmrActualService(session, project_id, user_id)
    actual, warning = await service.create(payload)
    response = JmrActualResponse.model_validate(actual)
    response.warning = warning
    return response
