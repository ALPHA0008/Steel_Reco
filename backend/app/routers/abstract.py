from fastapi import APIRouter, Query

from app.dependencies import ProjectScope, ScopedSession
from app.schemas.abstract import AbstractResponse
from app.services.abstract_service import AbstractService

router = APIRouter(prefix="/api/v1/abstract", tags=["abstract"])


@router.get("", response_model=AbstractResponse)
async def get_abstract(
    project_id: ProjectScope,
    session: ScopedSession,
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
) -> AbstractResponse:
    """Live Abstract computation (plan §4) -- a SQL query, never a stored
    value. No summary number here is ever typed by a human (plan §0 invariant).
    """
    service = AbstractService(session)
    return await service.compute(project_id, year, month)
