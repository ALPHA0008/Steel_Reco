from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.repositories.grn_repository import GrnRepository
from app.schemas.transactions import GrnCreate, GrnResponse
from app.services.grn_service import GrnService

router = APIRouter(prefix="/api/v1/grn", tags=["grn"])


@router.get("", response_model=list[GrnResponse])
async def list_grn(project_id: ProjectScope, session: ScopedSession) -> list[GrnResponse]:
    items, _total = await GrnRepository(session, project_id=project_id).list(limit=200)
    return [GrnResponse.model_validate(g) for g in items]


@router.post("", response_model=GrnResponse, status_code=status.HTTP_201_CREATED)
async def create_grn(
    payload: GrnCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> GrnResponse:
    user_id, _role = current_user
    service = GrnService(session, project_id, user_id)
    grn, warning = await service.create(payload)
    response = GrnResponse.model_validate(grn)
    response.warning = warning
    return response
