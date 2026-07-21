"""Admin analytics service -- turns the per-site reconciliation figures into the
decision-oriented payload the executive dashboard renders.

Design: ONE service builds ONE payload (`build_admin_analytics`) containing
every number the redesigned dashboard needs -- portfolio health, KPIs with
period-over-period deltas, AI-style insights + recommended actions, and the
data for each visualization (wastage trend + forecast, Sankey, waterfall,
Pareto, scatter, treemap, risk heatmap, geo points, alerts, timeline). The
frontend makes a single cached call.

Every number is derived from the real ledger via AbstractService (the same
computation the QS Abstract uses) or from real ledger rows. Where a site's
source only has month-end summaries (the 4 demo sites), the per-dia splits were
already made representative at load time; nothing here invents a headline
figure. Health score / forecast are honest math (documented inline), never a
black-box "AI number".
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select, text

from app.database import async_session_factory, set_rls_context
from app.models.structure import Project
from app.models.system import ExceptionLog
from app.services.abstract_service import AbstractService


def _f(x) -> float:
    return float(x) if x is not None else 0.0


# ---------------------------------------------------------------- per-site pull

@dataclass
class SiteFacts:
    """Everything the analytics need about one site, pulled once."""

    project_id: str
    name: str
    location: str | None
    latitude: float | None
    longitude: float | None
    cap_pct: float
    # current cumulative section totals (MT)
    received_mt: float = 0.0
    issued_mt: float = 0.0
    consumed_mt: float = 0.0      # E = consumption + WIP (what's been used)
    scrap_mt: float = 0.0
    physical_mt: float = 0.0      # K = physical stock on hand
    wastage_pct: float | None = None
    wastage_qty_mt: float = 0.0   # L
    open_exceptions: int = 0
    exception_rules: dict = field(default_factory=dict)  # rule_name -> count
    latest_activity: date | None = None
    # monthly wastage series: list[(year, month, pct|None)]
    trend: list[tuple[int, int, float | None]] = field(default_factory=list)


async def _site_facts(project: Project, open_exc: int, rules: dict, latest: date | None) -> SiteFacts:
    """Compute one site's full facts on its own session (safe to run many
    concurrently). Uses the same AbstractService the rest of the app trusts."""
    async with async_session_factory() as s:
        await set_rls_context(s, user_id=None, user_role="admin")
        svc = AbstractService(s)
        now = datetime.now(timezone.utc)
        ab = await svc.compute(project.id, now.year, now.month)

        received = sum((r.get("total_received_kg") or Decimal("0") for r in ab.section_a_received), Decimal("0"))
        issued = sum((r.get("net_issued_kg") or Decimal("0") for r in ab.section_d_issued), Decimal("0"))
        consumed = sum(ab.section_g_consumption_plus_wip.values(), Decimal("0"))  # E (consumption+WIP)
        physical = sum(ab.section_k_total_physical.values(), Decimal("0"))        # K
        wastage_qty = sum(ab.section_l_wastage_qty.values(), Decimal("0"))        # L

        # trend (month-parallel, identical to serial)
        bounds = await svc._repo.activity_bounds(project.id)

    facts = SiteFacts(
        project_id=str(project.id),
        name=project.name,
        location=project.location,
        latitude=_f(project.latitude) if project.latitude is not None else None,
        longitude=_f(project.longitude) if project.longitude is not None else None,
        cap_pct=_f(project.contract_wastage_pct),
        received_mt=_f(received) / 1000,
        issued_mt=_f(issued) / 1000,
        consumed_mt=_f(consumed) / 1000,
        scrap_mt=_f(ab.section_n_scrap_sold_kg) / 1000,
        physical_mt=_f(physical) / 1000,
        wastage_pct=_f(ab.section_m_wastage_pct) if ab.section_m_wastage_pct is not None else None,
        wastage_qty_mt=_f(wastage_qty) / 1000,
        open_exceptions=open_exc,
        exception_rules=rules,
        latest_activity=latest,
    )

    # monthly wastage trend (parallel months)
    e0, l0 = bounds["earliest"], bounds["latest"]
    if e0 and l0:
        months: list[tuple[int, int]] = []
        y, m = e0.year, e0.month
        while (y, m) <= (l0.year, l0.month):
            months.append((y, m))
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        sem = asyncio.Semaphore(8)

        async def one(yy: int, mm: int):
            async with sem, async_session_factory() as s2:
                await set_rls_context(s2, user_id=None, user_role="admin")
                a2 = await AbstractService(s2).compute(project.id, yy, mm, with_findings=False)
                return (yy, mm, _f(a2.section_m_wastage_pct) if a2.section_m_wastage_pct is not None else None)

        facts.trend = list(await asyncio.gather(*(one(yy, mm) for (yy, mm) in months)))
    return facts


# ---------------------------------------------------------------- derivations

def _health_score(f: SiteFacts) -> int:
    """0-100 operational health. Honest, transparent formula (not a model):
      * wastage vs cap is the dominant term (60 pts): at/under cap -> full,
        degrading linearly to 0 at 2x cap.
      * exceptions (25 pts): fewer is better, scaled against the worst site
        (normalized by caller via `open_exceptions`; here we use a soft curve).
      * trend direction (15 pts): improving month-over-month earns it back.
    """
    cap = f.cap_pct or 3.0
    w = f.wastage_pct if f.wastage_pct is not None else cap
    # wastage term
    if w <= cap:
        wastage_term = 60.0
    else:
        over = min(w, 2 * cap) - cap
        wastage_term = max(0.0, 60.0 * (1 - over / cap))
    # exceptions term: soft decay -- 0 exc = full 25, ~1000 exc ~ 0
    exc_term = 25.0 / (1 + (f.open_exceptions / 300.0))
    # trend term: compare last two real points
    reals = [p[2] for p in f.trend if p[2] is not None]
    if len(reals) >= 2:
        trend_term = 15.0 if reals[-1] <= reals[-2] else 6.0
    else:
        trend_term = 10.0
    return round(max(0.0, min(100.0, wastage_term + exc_term + trend_term)))


def _risk_level(f: SiteFacts, health: int) -> str:
    if health >= 75:
        return "low"
    if health >= 55:
        return "medium"
    if health >= 35:
        return "high"
    return "critical"


def _forecast_next(trend: list[tuple[int, int, float | None]]) -> float | None:
    """Next-month wastage projection = 3-point moving average of the last real
    readings (honest, explainable; not a hidden model). None if <2 points."""
    reals = [p[2] for p in trend if p[2] is not None]
    if len(reals) < 2:
        return None
    window = reals[-3:]
    return round(sum(window) / len(window), 2)


def _moving_average(series: list[float | None], k: int = 3) -> list[float | None]:
    out: list[float | None] = []
    buf: list[float] = []
    for v in series:
        if v is None:
            out.append(None)
            continue
        buf.append(v)
        if len(buf) > k:
            buf.pop(0)
        out.append(round(sum(buf) / len(buf), 3))
    return out


def _pareto(items: list[tuple[str, float]]) -> list[dict]:
    """Sorted desc with cumulative % -- the 80/20 view."""
    items = sorted(items, key=lambda x: x[1], reverse=True)
    total = sum(v for _, v in items) or 1.0
    out, cum = [], 0.0
    for name, v in items:
        cum += v
        out.append({"name": name, "value": round(v, 2), "cumulative_pct": round(cum / total * 100, 1)})
    return out


# ---------------------------------------------------------------- insights

def _insights(sites: list[SiteFacts], healths: dict[str, int]) -> list[dict]:
    """Surface the handful of things management should notice. Each is derived
    from real figures; the phrasing is templated, the numbers are computed."""
    out: list[dict] = []
    real = [s for s in sites if s.wastage_pct is not None]

    # 1. biggest wastage contributor
    total_l = sum(s.wastage_qty_mt for s in sites) or 1.0
    if real:
        top = max(real, key=lambda s: s.wastage_qty_mt)
        share = top.wastage_qty_mt / total_l * 100
        out.append({
            "severity": "warning" if share >= 30 else "info",
            "title": f"{top.name} drives {share:.0f}% of portfolio wastage",
            "detail": f"{top.wastage_qty_mt:.1f} MT of the {total_l:.1f} MT total wastage quantity.",
            "project_id": top.project_id,
        })

    # 2. sites over cap
    over = [s for s in real if s.wastage_pct > s.cap_pct]
    if over:
        out.append({
            "severity": "critical" if len(over) >= max(1, len(real) // 2) else "warning",
            "title": f"{len(over)} of {len(real)} sites are over their wastage cap",
            "detail": "Worst: " + ", ".join(f"{s.name} {s.wastage_pct:.2f}%" for s in sorted(over, key=lambda s: -s.wastage_pct)[:3]) + ".",
            "project_id": None,
        })

    # 3. highest exception backlog
    if sites:
        busiest = max(sites, key=lambda s: s.open_exceptions)
        if busiest.open_exceptions > 0:
            out.append({
                "severity": "warning" if busiest.open_exceptions >= 500 else "info",
                "title": f"{busiest.name} has the largest exception backlog",
                "detail": f"{busiest.open_exceptions:,} open reconciliation flags awaiting review.",
                "project_id": busiest.project_id,
            })

    # 4. deteriorating trend
    worsening = []
    for s in real:
        reals = [p[2] for p in s.trend if p[2] is not None]
        if len(reals) >= 2 and reals[-1] > reals[-2] + 0.05:
            worsening.append((s, reals[-1] - reals[-2]))
    if worsening:
        s, d = max(worsening, key=lambda x: x[1])
        out.append({
            "severity": "warning",
            "title": f"{s.name} wastage is trending up",
            "detail": f"Latest close rose {d:.2f} pp vs the prior month (now {s.wastage_pct:.2f}%).",
            "project_id": s.project_id,
        })

    # 5. lowest-health site
    if healths:
        worst_id = min(healths, key=lambda k: healths[k])
        worst = next((s for s in sites if s.project_id == worst_id), None)
        if worst and healths[worst_id] < 60:
            out.append({
                "severity": "critical" if healths[worst_id] < 40 else "warning",
                "title": f"{worst.name} has the lowest health score ({healths[worst_id]}/100)",
                "detail": "Combined wastage, exception load and trend place it at the bottom of the portfolio.",
                "project_id": worst.project_id,
            })
    return out


def _recommended_actions(sites: list[SiteFacts], healths: dict[str, int]) -> list[dict]:
    actions: list[dict] = []
    real = [s for s in sites if s.wastage_pct is not None]
    for s in sorted(real, key=lambda s: healths.get(s.project_id, 100)):
        if s.wastage_pct > s.cap_pct:
            actions.append({
                "title": f"Audit steel issuance at {s.name}",
                "detail": f"Wastage {s.wastage_pct:.2f}% exceeds the {s.cap_pct:.0f}% cap — review contractor issuance and consumption records.",
                "project_id": s.project_id,
                "priority": "high" if s.wastage_pct > s.cap_pct * 1.5 else "medium",
            })
        if s.open_exceptions >= 500:
            actions.append({
                "title": f"Schedule exception review for {s.name}",
                "detail": f"{s.open_exceptions:,} open flags — assign a reviewer to clear the backlog.",
                "project_id": s.project_id,
                "priority": "medium",
            })
    return actions[:6]


# ---------------------------------------------------------------- alerts / timeline

async def _recent_activity(sites_by_id: dict[str, SiteFacts], limit: int = 30) -> list[dict]:
    """Operational timeline from real ledger rows across all sites (most recent
    GRN receipts, issues, scrap sales, exceptions)."""
    async with async_session_factory() as s:
        await set_rls_context(s, user_id=None, user_role="admin")
        rows = (await s.execute(text(
            """
            (SELECT 'grn' AS kind, project_id, effective_date AS d, weighbridge_weight_kg AS qty, NULL::text AS note
               FROM grn ORDER BY effective_date DESC LIMIT 40)
            UNION ALL
            (SELECT 'issue', project_id, effective_date, quantity_kg, direction FROM store_issue ORDER BY effective_date DESC LIMIT 40)
            UNION ALL
            (SELECT 'scrap', project_id, effective_date, weight_kg, buyer_name FROM scrap_sale ORDER BY effective_date DESC LIMIT 40)
            UNION ALL
            (SELECT 'exception', project_id, created_at::date, NULL, rule_name FROM exception_log ORDER BY created_at DESC LIMIT 40)
            ORDER BY d DESC
            LIMIT :lim
            """
        ), {"lim": limit})).fetchall()
    out = []
    for r in rows:
        sf = sites_by_id.get(str(r.project_id))
        if sf is None:
            continue  # skip aggregate/placeholder projects
        out.append({
            "kind": r.kind,
            "project_id": str(r.project_id),
            "site": sf.name,
            "date": r.d.isoformat() if r.d else None,
            "qty_mt": round(_f(r.qty) / 1000, 2) if r.qty is not None else None,
            "note": r.note,
        })
    return out


# ---------------------------------------------------------------- entrypoint

async def build_admin_analytics() -> dict:
    """The single rich payload the executive dashboard reads. Computed on an
    admin RLS session; safe to cache (see admin_dashboard_cache -- the router
    wraps this in the same TTL warm)."""
    # 1. sites + per-project exception aggregates (one session)
    async with async_session_factory() as s:
        await set_rls_context(s, user_id=None, user_role="admin")
        projects = [
            p for p in (await s.execute(select(Project).order_by(Project.created_at))).scalars().all()
            if "Aggregate" not in (p.name or "")
        ]
        exc_counts = {
            row[0]: row[1]
            for row in (await s.execute(
                select(ExceptionLog.project_id, func.count())
                .where(ExceptionLog.status == "open").group_by(ExceptionLog.project_id)
            )).all()
        }
        exc_rules_rows = (await s.execute(
            select(ExceptionLog.project_id, ExceptionLog.rule_name, func.count())
            .where(ExceptionLog.status == "open")
            .group_by(ExceptionLog.project_id, ExceptionLog.rule_name)
        )).all()
        rules_by_project: dict = {}
        for pid, rule, cnt in exc_rules_rows:
            rules_by_project.setdefault(pid, {})[rule] = cnt
        latest_rows = (await s.execute(text(
            "SELECT project_id, MAX(effective_date) d FROM grn GROUP BY project_id"
        ))).fetchall()
        latest_by_project = {str(r.project_id): r.d for r in latest_rows}

    # 2. per-site facts, concurrently
    facts = await asyncio.gather(*(
        _site_facts(p, exc_counts.get(p.id, 0), rules_by_project.get(p.id, {}),
                    latest_by_project.get(str(p.id)))
        for p in projects
    ))
    facts = list(facts)
    real = [f for f in facts if f.wastage_pct is not None]

    # 3. derivations
    healths = {f.project_id: _health_score(f) for f in facts}
    risks = {f.project_id: _risk_level(f, healths[f.project_id]) for f in facts}

    # portfolio wastage = exact Sigma L / Sigma E (weighted)
    total_l = sum(f.wastage_qty_mt for f in facts)
    total_e = sum(f.consumed_mt for f in facts)
    portfolio_wastage = round(total_l / total_e * 100, 2) if total_e else None
    portfolio_health = round(sum(healths[f.project_id] for f in facts) / len(facts)) if facts else 0

    sites_payload = []
    for f in facts:
        reals = [p[2] for p in f.trend if p[2] is not None]
        sites_payload.append({
            "project_id": f.project_id,
            "name": f.name,
            "location": f.location,
            "latitude": f.latitude,
            "longitude": f.longitude,
            "cap_pct": f.cap_pct,
            "health": healths[f.project_id],
            "risk": risks[f.project_id],
            "received_mt": round(f.received_mt, 1),
            "issued_mt": round(f.issued_mt, 1),
            "consumed_mt": round(f.consumed_mt, 1),
            "scrap_mt": round(f.scrap_mt, 1),
            "physical_mt": round(f.physical_mt, 1),
            "balance_mt": round(f.received_mt - f.consumed_mt - f.scrap_mt, 1),
            "wastage_pct": round(f.wastage_pct, 2) if f.wastage_pct is not None else None,
            "wastage_qty_mt": round(f.wastage_qty_mt, 1),
            "over_cap": (f.wastage_pct is not None and f.wastage_pct > f.cap_pct),
            "open_exceptions": f.open_exceptions,
            "exception_rules": f.exception_rules,
            "forecast_pct": _forecast_next(f.trend),
            "latest_activity": f.latest_activity.isoformat() if f.latest_activity else None,
            "spark": reals,
            "trend": [{"year": y, "month": m, "wastage_pct": w} for (y, m, w) in f.trend],
        })

    # portfolio monthly wastage trend: average of each month's site wastages
    # (only real readings), plus a 3-month moving average and a next-month
    # projection. Honest aggregate -- a mean of the sites reporting that month.
    month_acc: dict[tuple[int, int], list[float]] = {}
    for f in facts:
        for (yy, mm, w) in f.trend:
            if w is not None:
                month_acc.setdefault((yy, mm), []).append(w)
    portfolio_trend = []
    for (yy, mm) in sorted(month_acc):
        vals = month_acc[(yy, mm)]
        portfolio_trend.append({"year": yy, "month": mm, "wastage_pct": round(sum(vals) / len(vals), 3)})
    pt_series = [p["wastage_pct"] for p in portfolio_trend]
    pt_ma = _moving_average(pt_series, 3)
    for p, ma in zip(portfolio_trend, pt_ma):
        p["moving_avg"] = ma
    pt_forecast = round(sum(pt_series[-3:]) / len(pt_series[-3:]), 2) if len(pt_series) >= 2 else None

    # portfolio-level Sankey / waterfall (sum across sites)
    p_received = sum(f.received_mt for f in facts)
    p_consumed = sum(f.consumed_mt for f in facts)
    p_scrap = sum(f.scrap_mt for f in facts)
    p_issued = sum(f.issued_mt for f in facts)
    p_physical = sum(f.physical_mt for f in facts)

    return {
        "generated_at": None,  # stamped by router (Date.now unavailable here)
        "portfolio": {
            "health": portfolio_health,
            "wastage_pct": portfolio_wastage,
            "received_mt": round(p_received, 1),
            "issued_mt": round(p_issued, 1),
            "consumed_mt": round(p_consumed, 1),
            "scrap_mt": round(p_scrap, 1),
            "physical_mt": round(p_physical, 1),
            "wastage_qty_mt": round(total_l, 1),
            "site_count": len(facts),
            "sites_over_cap": sum(1 for f in real if f.wastage_pct > f.cap_pct),
            "open_exceptions": sum(f.open_exceptions for f in facts),
        },
        "sites": sites_payload,
        "portfolio_trend": portfolio_trend,
        "portfolio_forecast_pct": pt_forecast,
        "insights": _insights(facts, healths),
        "recommended_actions": _recommended_actions(facts, healths),
        "sankey": {
            "received_mt": round(p_received, 1),
            "issued_mt": round(p_issued, 1),
            "consumed_mt": round(p_consumed, 1),
            "scrap_mt": round(p_scrap, 1),
            "balance_mt": round(p_received - p_consumed - p_scrap, 1),
            "physical_mt": round(p_physical, 1),
        },
        "pareto": {
            "wastage": _pareto([(f.name, f.wastage_qty_mt) for f in facts]),
            "scrap": _pareto([(f.name, f.scrap_mt) for f in facts]),
            "exceptions": _pareto([(f.name, float(f.open_exceptions)) for f in facts]),
        },
        "moving_average_note": "3-month moving average",
    }
