import uuid

from fastapi import APIRouter, Query

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.schemas.exceptions import ExceptionLogResponse, ExceptionResolveRequest
from app.services.exception_service import ExceptionService

router = APIRouter(prefix="/api/v1/exceptions", tags=["exceptions"])


@router.get("", response_model=list[ExceptionLogResponse])
async def list_exceptions(
    project_id: ProjectScope,
    current_user: CurrentUser,
    session: ScopedSession,
    status_filter: str | None = Query(None, alias="status"),
) -> list[ExceptionLogResponse]:
    user_id, role = current_user
    service = ExceptionService(session, project_id, user_id, user_role=role)
    rows = await service.list(status_filter)
    return [ExceptionLogResponse.model_validate(r) for r in rows]


@router.post("/{exception_id}/resolve", response_model=ExceptionLogResponse)
async def resolve_exception(
    exception_id: uuid.UUID,
    payload: ExceptionResolveRequest,
    project_id: ProjectScope,
    current_user: CurrentUser,
    session: ScopedSession,
) -> ExceptionLogResponse:
    user_id, role = current_user
    # The role is taken from the verified token, never from the payload.
    service = ExceptionService(session, project_id, user_id, user_role=role)
    row = await service.resolve(
        exception_id,
        payload.resolution_type,
        payload.reason,
        follow_up_due_date=payload.follow_up_due_date,
        resolver_name=payload.resolver_name,
    )
    return ExceptionLogResponse.model_validate(row)
