from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter

from app.dependencies import ProjectScope, ScopedSession
from app.schemas.dashboard import DashboardSummary
from app.services.abstract_service import AbstractService

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_summary(project_id: ProjectScope, session: ScopedSession) -> DashboardSummary:
    """Current-month KPIs, derived from the same live Abstract computation
    (plan §6) -- never a separately-maintained number."""
    now = datetime.now(timezone.utc)
    abstract = await AbstractService(session).compute(project_id, now.year, now.month)

    total_received = sum(
        (row.get("total_received_kg") or Decimal("0") for row in abstract.section_a_received), Decimal("0")
    )
    total_issued = sum(
        (row.get("net_issued_kg") or Decimal("0") for row in abstract.section_d_issued), Decimal("0")
    )

    return DashboardSummary(
        period_label=abstract.period_label,
        total_received_kg=total_received,
        total_issued_kg=total_issued,
        total_scrap_sold_kg=abstract.section_n_scrap_sold_kg,
        wastage_pct=abstract.section_m_wastage_pct,
    )
