from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.schemas.month_close import FinalizeRequest, FinalizeResponse, ReopenRequest
from app.services.month_close_service import MonthCloseService

router = APIRouter(prefix="/api/v1/month-close", tags=["month-close"])


@router.post("/finalize", response_model=FinalizeResponse, status_code=status.HTTP_201_CREATED)
async def finalize_month(
    payload: FinalizeRequest, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> FinalizeResponse:
    user_id, _role = current_user
    service = MonthCloseService(session, project_id, user_id)
    return await service.finalize(payload.year, payload.month)


@router.post("/reopen", status_code=status.HTTP_204_NO_CONTENT)
async def reopen_month(
    payload: ReopenRequest, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> None:
    user_id, _role = current_user
    service = MonthCloseService(session, project_id, user_id)
    await service.reopen(payload.year, payload.month, payload.reason)
