from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.repositories.inter_site_transfer_repository import InterSiteTransferRepository
from app.schemas.transactions import InterSiteTransferCreate, InterSiteTransferResponse
from app.services.inter_site_transfer_service import InterSiteTransferService

router = APIRouter(prefix="/api/v1/inter-site-transfers", tags=["inter-site-transfers"])


@router.get("", response_model=list[InterSiteTransferResponse])
async def list_transfers(project_id: ProjectScope, session: ScopedSession) -> list[InterSiteTransferResponse]:
    items, _total = await InterSiteTransferRepository(session, project_id=project_id).list(limit=200)
    return [InterSiteTransferResponse.model_validate(i) for i in items]


@router.post("", response_model=InterSiteTransferResponse, status_code=status.HTTP_201_CREATED)
async def create_transfer(
    payload: InterSiteTransferCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> InterSiteTransferResponse:
    user_id, _role = current_user
    service = InterSiteTransferService(session, project_id, user_id)
    transfer, warning = await service.create(payload)
    resp = InterSiteTransferResponse.model_validate(transfer)
    resp.warning = warning
    return resp
