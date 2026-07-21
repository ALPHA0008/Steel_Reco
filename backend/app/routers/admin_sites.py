"""Admin multi-site dashboard endpoints.

Every route is gated by RequireAdmin and uses a ScopedSession whose RLS context
(app.user_role = 'admin') makes accessible_project_ids() return ALL projects --
so an admin can read any site's data. This is the ONE place a project_id
legitimately comes from the request path: RLS still confines it to real,
accessible projects, and require_admin gates who can call it at all.

Performance: each site's headline numbers + wastage trend are computed from the
ledger (the Abstract is never stored). Computing all sites live on every view is
slow, so results flow through an in-process TTL cache
(app.services.admin_dashboard_cache) -- first view warms it, the rest are
instant. Cached numbers are identical to a live compute.

The internal "Other Sites (... Aggregate)" projects are transfer counterparties,
not real sites, and are excluded from every admin view here by name.
"""
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.dependencies import RequireAdmin, ScopedSession
from app.models.structure import Project
from app.models.system import ExceptionLog
from app.schemas.abstract import AbstractResponse, WastageTrendPoint, WastageTrendResponse
from app.schemas.admin import AdminMasterSummary, AdminSiteSummary
from app.schemas.dashboard import DashboardSummary
from app.services import admin_dashboard_cache as cache
from app.services.abstract_service import AbstractService

router = APIRouter(prefix="/api/v1/admin", tags=["admin-sites"])

_AGGREGATE_NAME_FRAGMENT = "Aggregate"


def _is_real_site(project: Project) -> bool:
    return _AGGREGATE_NAME_FRAGMENT not in (project.name or "")


async def _open_exceptions_by_project(session) -> dict:
    result = await session.execute(
        select(ExceptionLog.project_id, func.count())
        .where(ExceptionLog.status == "open")
        .group_by(ExceptionLog.project_id)
    )
    return {row[0]: row[1] for row in result.all()}


def _summary_from_abstract(project: Project, abstract, open_exc: int) -> AdminSiteSummary:
    total_received = sum(
        (row.get("total_received_kg") or Decimal("0") for row in abstract.section_a_received), Decimal("0")
    )
    total_issued = sum(
        (row.get("net_issued_kg") or Decimal("0") for row in abstract.section_d_issued), Decimal("0")
    )
    wastage = abstract.section_m_wastage_pct
    over_cap = wastage is not None and wastage > project.contract_wastage_pct
    return AdminSiteSummary(
        project_id=project.id,
        name=project.name,
        location=project.location,
        status=project.status,
        contract_wastage_pct=project.contract_wastage_pct,
        period_label=abstract.period_label,
        total_received_kg=total_received,
        total_issued_kg=total_issued,
        total_scrap_sold_kg=abstract.section_n_scrap_sold_kg,
        wastage_pct=wastage,
        over_cap=over_cap,
        open_exceptions=open_exc,
    )


async def _real_sites(session) -> list[Project]:
    result = await session.execute(select(Project).order_by(Project.created_at))
    return [p for p in result.scalars().all() if _is_real_site(p)]


async def _get_real_site(session, project_id) -> Project:
    result = await session.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None or not _is_real_site(project):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return project


async def _parallel_wastage_trend(project_id, cap) -> WastageTrendResponse:
    """The wastage trend, computed with the months run CONCURRENTLY instead of
    one-after-another. Each month is a full, unchanged compute() (identical
    numbers to the serial trend) on its own pooled session; a semaphore caps
    how many run at once so we don't open dozens of DB connections. This is the
    single biggest speed win -- a 51-month trend drops from ~10s to ~2s."""
    import asyncio

    from app.database import async_session_factory, set_rls_context
    from app.services.abstract_service import _month_end  # noqa: F401 (kept for clarity)

    # Reuse one throwaway session just to read the activity bounds + cap.
    async with async_session_factory() as s0:
        await set_rls_context(s0, user_id=None, user_role="admin")
        svc0 = AbstractService(s0)
        bounds = await svc0._repo.activity_bounds(project_id)
    earliest, latest = bounds["earliest"], bounds["latest"]
    if earliest is None or latest is None:
        return WastageTrendResponse(contract_wastage_cap_pct=cap or Decimal("3.00"), points=[])

    months: list[tuple[int, int]] = []
    y, m = earliest.year, earliest.month
    while (y, m) <= (latest.year, latest.month):
        months.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

    sem = asyncio.Semaphore(8)

    async def one(year: int, month: int) -> WastageTrendPoint:
        async with sem, async_session_factory() as s:
            await set_rls_context(s, user_id=None, user_role="admin")
            ab = await AbstractService(s).compute(project_id, year, month, with_findings=False)
            return WastageTrendPoint(
                year=year, month=month, period_label=ab.period_label,
                wastage_pct=ab.section_m_wastage_pct,
            )

    points = await asyncio.gather(*(one(y, m) for (y, m) in months))
    return WastageTrendResponse(contract_wastage_cap_pct=cap or Decimal("3.00"), points=list(points))


async def _compute_site_summary(project: Project, open_exc: int):
    """Fast path: a site's current-month summary + L/G only (NO trend). ~0.5s.
    This is all the dashboard KPIs, cards, and analytics need to render."""
    from app.database import async_session_factory, set_rls_context

    async with async_session_factory() as session:
        await set_rls_context(session, user_id=None, user_role="admin")
        svc = AbstractService(session)
        now = datetime.now(timezone.utc)
        abstract = await svc.compute(project.id, now.year, now.month)
        summary = _summary_from_abstract(project, abstract, open_exc)
        l_total = sum(abstract.section_l_wastage_qty.values(), Decimal("0"))
        g_total = sum(abstract.section_g_consumption_plus_wip.values(), Decimal("0"))
    return summary, l_total, g_total


async def _cache_site_trend(project_id, existing_summary=None) -> WastageTrendResponse:
    """Compute a site's full (month-parallel) wastage trend, cache it alongside
    the existing summary, and backfill the summary's sparkline."""
    from app.database import async_session_factory, set_rls_context

    async with async_session_factory() as session:
        await set_rls_context(session, user_id=None, user_role="admin")
        cap = await AbstractService(session)._repo.contract_wastage_cap_pct(project_id)
    trend = await _parallel_wastage_trend(project_id, cap)
    snap = cache.get_site_any(str(project_id))
    summary = existing_summary or (snap.summary if snap else None)
    if summary is not None:
        summary.wastage_spark = [float(p.wastage_pct) for p in trend.points if p.wastage_pct is not None]
        cache.put_site(
            str(project_id), summary, trend,
            snap.l_total if snap else Decimal("0"),
            snap.g_total if snap else Decimal("0"),
        )
    return trend


async def _warm_summaries(session):
    """Fast tier: cache every site's SUMMARY (no trend) concurrently, so the
    dashboard's numbers/cards/analytics render quickly. Returns snapshots (with
    whatever trend was already cached, else an empty one)."""
    import asyncio

    async with cache.lock():
        cached = cache.all_fresh_snapshots()
        if cached is not None:
            return cached
        sites = await _real_sites(session)
        open_exc = await _open_exceptions_by_project(session)
        results = await asyncio.gather(
            *(_compute_site_summary(p, open_exc.get(p.id, 0)) for p in sites)
        )
        for p, (summary, lt, gt) in zip(sites, results):
            prev = cache.get_site_any(str(p.id))
            trend = prev.trend if prev else WastageTrendResponse(
                contract_wastage_cap_pct=p.contract_wastage_pct, points=[]
            )
            if prev and prev.summary.wastage_spark:
                summary.wastage_spark = prev.summary.wastage_spark
            cache.put_site(str(p.id), summary, trend, lt, gt)
        cache.mark_full_set()
        return [cache.get_site(str(p.id)) for p in sites if cache.get_site(str(p.id))]


async def _warm_trends(session) -> None:
    """Slow tier (background): fill in every site's full wastage trend +
    sparkline. Runs after summaries so the dashboard is already usable."""
    sites = await _real_sites(session)
    for p in sites:
        await _cache_site_trend(p.id)


# Backwards-compatible name used by the startup warm in main.py.
async def _warm_all(session):
    snaps = await _warm_summaries(session)
    await _warm_trends(session)
    # Also warm the executive-analytics payload so the redesigned dashboard is
    # instant on first open.
    await _warm_analytics()
    return snaps


@router.get("/sites", response_model=list[AdminSiteSummary])
async def list_sites(_admin: RequireAdmin, session: ScopedSession) -> list[AdminSiteSummary]:
    """All real sites with their current headline numbers. Uses the FAST
    summary tier so the dashboard renders in ~1s; sparklines fill in as the
    background trend warm completes."""
    return [snap.summary for snap in await _warm_summaries(session)]


@router.get("/master-summary", response_model=AdminMasterSummary)
async def master_summary(_admin: RequireAdmin, session: ScopedSession) -> AdminMasterSummary:
    """Company-wide roll-up. Portfolio wastage is an exact Sigma L / Sigma G
    across sites (never an average of percentages), from the cached per-site
    L (wastage qty) and G (consumption+WIP) totals."""
    snaps = await _warm_summaries(session)
    summaries = [s.summary for s in snaps]
    total_l = sum((s.l_total for s in snaps), Decimal("0"))
    total_g = sum((s.g_total for s in snaps), Decimal("0"))
    weighted = (total_l / total_g * 100) if total_g != 0 else None
    return AdminMasterSummary(
        site_count=len(summaries),
        sites_over_cap=sum(1 for s in summaries if s.over_cap),
        total_received_kg=sum((s.total_received_kg for s in summaries), Decimal("0")),
        total_issued_kg=sum((s.total_issued_kg for s in summaries), Decimal("0")),
        total_scrap_sold_kg=sum((s.total_scrap_sold_kg for s in summaries), Decimal("0")),
        open_exceptions=sum(s.open_exceptions for s in summaries),
        weighted_wastage_pct=weighted,
    )


async def _warm_analytics() -> dict:
    """Build (or return cached) the full executive-analytics payload. Guarded
    so concurrent admin requests don't all recompute; timeline/timestamp are
    stamped here since the service can't call datetime at build time cheaply."""
    cached = cache.get_analytics()
    if cached is not None:
        return cached
    async with cache.analytics_lock():
        cached = cache.get_analytics()
        if cached is not None:
            return cached
        from app.services.admin_analytics_service import _recent_activity, build_admin_analytics

        payload = await build_admin_analytics()
        payload["generated_at"] = datetime.now(timezone.utc).isoformat()
        # timeline needs the site map; rebuild a light id->name index
        by_id = {s["project_id"]: type("S", (), {"name": s["name"]})() for s in payload["sites"]}
        payload["timeline"] = await _recent_activity(by_id)
        cache.put_analytics(payload)
        return payload


@router.get("/analytics")
async def admin_analytics(_admin: RequireAdmin, _session: ScopedSession) -> dict:
    """The single rich payload the executive dashboard reads -- portfolio
    health, KPIs, insights, recommended actions, and every visualization's
    data. Cached (TTL) and warmed at startup, so it serves in ~ms."""
    return await _warm_analytics()


@router.get("/sites/{project_id}/dashboard-summary", response_model=DashboardSummary)
async def site_dashboard_summary(project_id: str, _admin: RequireAdmin, session: ScopedSession) -> DashboardSummary:
    snap = cache.get_site(project_id)
    if snap is not None:
        s = snap.summary
        return DashboardSummary(
            period_label=s.period_label or "",
            total_received_kg=s.total_received_kg,
            total_issued_kg=s.total_issued_kg,
            total_scrap_sold_kg=s.total_scrap_sold_kg,
            wastage_pct=s.wastage_pct,
        )
    project = await _get_real_site(session, project_id)
    open_exc = await _open_exceptions_by_project(session)
    summary, lt, gt = await _compute_site_summary(project, open_exc.get(project.id, 0))
    prev = cache.get_site_any(project_id)
    trend = prev.trend if prev else WastageTrendResponse(
        contract_wastage_cap_pct=project.contract_wastage_pct, points=[]
    )
    cache.put_site(project_id, summary, trend, lt, gt)
    return DashboardSummary(
        period_label=summary.period_label or "",
        total_received_kg=summary.total_received_kg,
        total_issued_kg=summary.total_issued_kg,
        total_scrap_sold_kg=summary.total_scrap_sold_kg,
        wastage_pct=summary.wastage_pct,
    )


@router.get("/sites/{project_id}/wastage-trend", response_model=WastageTrendResponse)
async def site_wastage_trend(project_id: str, _admin: RequireAdmin, session: ScopedSession) -> WastageTrendResponse:
    snap = cache.get_site(project_id)
    if snap is not None and snap.trend.points:
        return snap.trend
    # Not cached yet (or only a summary is): compute the trend now (month-parallel,
    # ~2s) and cache it. One-time per site per TTL.
    project = await _get_real_site(session, project_id)
    return await _cache_site_trend(project.id)


@router.get("/sites/{project_id}/abstract", response_model=AbstractResponse)
async def site_abstract(
    project_id: str, year: int, month: int, _admin: RequireAdmin, session: ScopedSession
) -> AbstractResponse:
    project = await _get_real_site(session, project_id)
    return await AbstractService(session).compute(project.id, year, month)
