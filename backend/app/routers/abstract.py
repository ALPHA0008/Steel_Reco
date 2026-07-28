from fastapi import APIRouter, Query
from fastapi.responses import Response
from sqlalchemy import text

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.schemas.abstract import (
    AbstractResponse,
    DraftAbstractRequest,
    DraftAbstractResponse,
    PeriodBoundsResponse,
    WastageTrendResponse,
)
from app.schemas.data_health import DataHealthResponse
from app.services.abstract_export_service import AbstractExportService
from app.services.abstract_service import AbstractService
from app.services.data_health_service import DataHealthService
from app.services.draft_abstract_service import DraftAbstractService

router = APIRouter(prefix="/api/v1/abstract", tags=["abstract"])


@router.get("/period-bounds", response_model=PeriodBoundsResponse)
async def get_period_bounds(project_id: ProjectScope, session: ScopedSession) -> PeriodBoundsResponse:
    """Earliest/latest month with real ledger activity -- bounds the
    frontend's month/year picker so it can't land on an empty period.
    """
    service = AbstractService(session)
    return await service.get_period_bounds(project_id)


@router.get("/wastage-trend", response_model=WastageTrendResponse)
async def get_wastage_trend(
    project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> WastageTrendResponse:
    """Cumulative wastage % (Section M) as of every month-end with real
    activity -- powers the dashboard's wastage trend chart.

    The caller's identity is passed through so the months can be computed
    concurrently on their own sessions, each scoped exactly as this request is
    (see AbstractService.get_wastage_trend).
    """
    user_id, role = current_user
    service = AbstractService(session)
    return await service.get_wastage_trend(
        project_id, rls_user_id=str(user_id), rls_user_role=role
    )


@router.get("/data-health", response_model=DataHealthResponse)
async def get_data_health(project_id: ProjectScope, session: ScopedSession) -> DataHealthResponse:
    """Per-section data-completeness panel -- what's real, aggregate,
    synthetic, or known-stale, so this lives in the app rather than only in
    documentation.
    """
    service = DataHealthService(session)
    return await service.compute(project_id)


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


@router.post("/draft", response_model=DraftAbstractResponse)
async def compute_draft_abstract(
    payload: DraftAbstractRequest, project_id: ProjectScope, session: ScopedSession
) -> DraftAbstractResponse:
    """Quick Draft (plan: manual-entry verification mode). Someone who
    already knows the Abstract's numbers -- no ledger rows, no uploaded
    documents behind them -- types A/B/D/E/F/I/J/N per diameter. This derives
    C/G/H/K/L/M with the SAME math as the real Abstract and runs the same
    class of plausibility checks (issued > net received, wastage vs cap,
    scrap vs generated, per-dia sanity, and a BBS-plan cross-check against
    this real project's actual data). Nothing here is written to any table --
    it is a scratch check, not an official Abstract.
    """
    service = DraftAbstractService(session)
    return await service.compute(payload, check_against_project=project_id)


@router.get("/export")
async def export_abstract(
    project_id: ProjectScope,
    session: ScopedSession,
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
) -> Response:
    """The same Abstract, rendered into the A-N x diameter .xlsx grid the QS
    already knows -- something to hand up the chain, generated from the
    ledger (never typed), same as the on-screen Abstract.
    """
    project_name = (
        await session.execute(text("SELECT name FROM projects WHERE id = :pid"), {"pid": project_id})
    ).scalar_one()
    content = await AbstractExportService(session).export(project_id, project_name, year, month)
    filename = f"Steel_Abstract_{project_name.replace(' ', '_')}_{year}-{month:02d}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
