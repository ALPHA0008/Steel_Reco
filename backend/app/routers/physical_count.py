from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.repositories.physical_count_repository import PhysicalCountRepository
from app.schemas.transactions import PhysicalCountCreate, PhysicalCountResponse
from app.services.physical_count_service import PhysicalCountService

router = APIRouter(prefix="/api/v1/physical-counts", tags=["physical-counts"])


@router.get("", response_model=list[PhysicalCountResponse])
async def list_physical_counts(project_id: ProjectScope, session: ScopedSession) -> list[PhysicalCountResponse]:
    items, _total = await PhysicalCountRepository(session, project_id=project_id).list(limit=200)
    return [PhysicalCountResponse.model_validate(i) for i in items]


@router.post("", response_model=PhysicalCountResponse, status_code=status.HTTP_201_CREATED)
async def create_physical_count(
    payload: PhysicalCountCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> PhysicalCountResponse:
    user_id, _role = current_user
    service = PhysicalCountService(session, project_id, user_id)
    count = await service.create(payload)
    return PhysicalCountResponse.model_validate(count)
