from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.repositories.store_issue_repository import StoreIssueRepository
from app.schemas.transactions import StoreIssueCreate, StoreIssueResponse
from app.services.store_issue_service import StoreIssueService

router = APIRouter(prefix="/api/v1/store-issues", tags=["store-issues"])


@router.get("", response_model=list[StoreIssueResponse])
async def list_store_issues(project_id: ProjectScope, session: ScopedSession) -> list[StoreIssueResponse]:
    items, _total = await StoreIssueRepository(session, project_id=project_id).list(limit=200)
    return [StoreIssueResponse.model_validate(i) for i in items]


@router.post("", response_model=StoreIssueResponse, status_code=status.HTTP_201_CREATED)
async def create_store_issue(
    payload: StoreIssueCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> StoreIssueResponse:
    user_id, _role = current_user
    service = StoreIssueService(session, project_id, user_id)
    issue, warning = await service.create(payload)
    response = StoreIssueResponse.model_validate(issue)
    response.warning = warning
    return response
