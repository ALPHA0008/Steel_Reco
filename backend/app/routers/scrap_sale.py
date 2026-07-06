from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.repositories.scrap_sale_repository import ScrapSaleRepository
from app.schemas.transactions import ScrapSaleCreate, ScrapSaleResponse
from app.services.scrap_sale_service import ScrapSaleService

router = APIRouter(prefix="/api/v1/scrap-sales", tags=["scrap-sales"])


@router.get("", response_model=list[ScrapSaleResponse])
async def list_scrap_sales(project_id: ProjectScope, session: ScopedSession) -> list[ScrapSaleResponse]:
    items, _total = await ScrapSaleRepository(session, project_id=project_id).list(limit=200)
    return [ScrapSaleResponse.model_validate(i) for i in items]


@router.post("", response_model=ScrapSaleResponse, status_code=status.HTTP_201_CREATED)
async def create_scrap_sale(
    payload: ScrapSaleCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> ScrapSaleResponse:
    user_id, _role = current_user
    service = ScrapSaleService(session, project_id, user_id)
    sale = await service.create(payload)
    return ScrapSaleResponse.model_validate(sale)
