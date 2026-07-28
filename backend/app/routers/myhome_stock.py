from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.repositories.myhome_stock_repository import MyHomeStockRepository
from app.schemas.transactions import MyHomeStockCreate, MyHomeStockResponse
from app.services.myhome_stock_service import MyHomeStockService

router = APIRouter(prefix="/api/v1/myhome-stock", tags=["myhome-stock"])


@router.get("", response_model=list[MyHomeStockResponse])
async def list_myhome_stock(project_id: ProjectScope, session: ScopedSession) -> list[MyHomeStockResponse]:
    items, _total = await MyHomeStockRepository(session, project_id=project_id).list(limit=200)
    return [MyHomeStockResponse.model_validate(i) for i in items]


@router.post("", response_model=MyHomeStockResponse, status_code=status.HTTP_201_CREATED)
async def create_myhome_stock(
    payload: MyHomeStockCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> MyHomeStockResponse:
    user_id, _role = current_user
    service = MyHomeStockService(session, project_id, user_id)
    stock = await service.create(payload)
    return MyHomeStockResponse.model_validate(stock)
