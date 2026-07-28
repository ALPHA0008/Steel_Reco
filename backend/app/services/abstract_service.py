import asyncio
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory, set_rls_context
from app.repositories.abstract_repository import AbstractRepository
from app.schemas.abstract import AbstractResponse, PeriodBoundsResponse, WastageTrendPoint, WastageTrendResponse

PIPELINE_VERSION = "abstract@v1"


def _month_end(year: int, month: int) -> date:
    """Exclusive upper bound for the requested period, computed here -- never
    date_trunc(...) in a WHERE clause (plan §3.4/§4's sargability note).
    Every section is cumulative from project start through this date (no
    opening-balance concept, per the documented cumulative-ledger decision
    and the real Excel's own behavior) -- there is no month_start."""
    if month == 12:
        return date(year + 1, 1, 1)
    return date(year, month + 1, 1)


def _sum_by_dia(rows: list[dict], key: str) -> dict[str, Decimal]:
    totals: dict[str, Decimal] = {}
    for row in rows:
        dia = str(row["dia"])
        value = row.get(key) or Decimal("0")
        totals[dia] = totals.get(dia, Decimal("0")) + value
    return totals


class AbstractService:
    """READ-MODEL service (plan §5.1) -- never mutates state, composes
    AbstractRepository queries into the section A-N structure. This is the
    highest-risk component in the whole plan (§9's critical path): every
    number here must eventually match the real manual Excel Abstract to
    <0.1% variance (PRD §11.3 acceptance gate).
    """

    def __init__(self, session: AsyncSession) -> None:
        self._repo = AbstractRepository(session)

    async def get_period_bounds(self, project_id: uuid.UUID) -> PeriodBoundsResponse:
        bounds = await self._repo.activity_bounds(project_id)
        earliest, latest = bounds["earliest"], bounds["latest"]
        return PeriodBoundsResponse(
            earliest_year=earliest.year if earliest else None,
            earliest_month=earliest.month if earliest else None,
            latest_year=latest.year if latest else None,
            latest_month=latest.month if latest else None,
        )

    async def get_wastage_trend(
        self,
        project_id: uuid.UUID,
        *,
        rls_user_id: str | None = None,
        rls_user_role: str | None = None,
    ) -> WastageTrendResponse:
        """Section M (cumulative wastage %) as of every month-end from the
        project's earliest to latest real activity -- each point is a full
        re-run of compute(), same as the on-screen Abstract for that period,
        never a separately-tracked series.

        Each month is independent, so passing `rls_user_role` runs them
        CONCURRENTLY on their own pooled sessions instead of one after another.
        A 16-month trend issues ~128 cumulative queries; awaiting them serially
        was the slowest call in the app (~4.6s and no better on a second load).
        The numbers are identical either way -- this only changes how many are
        in flight at once.

        The identity is threaded through and re-applied to every child session
        so each one is scoped exactly as the caller is. It deliberately does NOT
        borrow the admin role to go faster: that would let a QS read a trend for
        a project they cannot otherwise see.

        Without an identity (internal callers, tests) it falls back to the
        serial path on the existing session, whose RLS context is already set.
        """
        bounds = await self._repo.activity_bounds(project_id)
        earliest, latest = bounds["earliest"], bounds["latest"]
        cap = await self._repo.contract_wastage_cap_pct(project_id)
        if earliest is None or latest is None:
            return WastageTrendResponse(contract_wastage_cap_pct=cap or Decimal("3.00"), points=[])

        months: list[tuple[int, int]] = []
        year, month = earliest.year, earliest.month
        while (year, month) <= (latest.year, latest.month):
            months.append((year, month))
            year, month = (year + 1, 1) if month == 12 else (year, month + 1)

        if rls_user_role is None:
            # Serial fallback -- one session, one month at a time.
            points = []
            for y, m in months:
                # Trend needs only section_m; skip the findings queries.
                ab = await self.compute(project_id, y, m, with_findings=False)
                points.append(
                    WastageTrendPoint(
                        year=y, month=m, period_label=ab.period_label,
                        wastage_pct=ab.section_m_wastage_pct,
                    )
                )
            return WastageTrendResponse(contract_wastage_cap_pct=cap or Decimal("3.00"), points=points)

        # Bounded concurrency: enough to hide latency, not enough to exhaust the
        # connection pool when several users load their dashboard at once.
        sem = asyncio.Semaphore(8)

        async def one(y: int, m: int) -> WastageTrendPoint:
            async with sem, async_session_factory() as child:
                await set_rls_context(child, user_id=rls_user_id, user_role=rls_user_role)
                ab = await AbstractService(child).compute(project_id, y, m, with_findings=False)
                return WastageTrendPoint(
                    year=y, month=m, period_label=ab.period_label,
                    wastage_pct=ab.section_m_wastage_pct,
                )

        computed = await asyncio.gather(*(one(y, m) for (y, m) in months))
        return WastageTrendResponse(
            contract_wastage_cap_pct=cap or Decimal("3.00"), points=list(computed)
        )

    async def compute(
        self, project_id: uuid.UUID, year: int, month: int, with_findings: bool = True
    ) -> AbstractResponse:
        """with_findings=False skips the aggregate cross-check queries, which
        the on-screen Abstract needs but the wastage-trend (which reads only
        section_m) does not. Default True preserves every existing caller's
        behavior exactly."""
        month_end = _month_end(year, month)

        section_a = await self._repo.section_a_received(project_id, month_end)
        section_b = await self._repo.section_b_transferred(project_id, month_end)
        section_d = await self._repo.section_d_issued(project_id, month_end)
        section_e = await self._repo.section_e_consumption(project_id, month_end)
        section_f = await self._repo.section_f_wip(project_id, month_end)
        sections_ij = await self._repo.sections_ij_physical_stock(project_id, month_end)
        myhome_by_dia = await self._repo.myhome_stock_by_dia(project_id, month_end)
        scrap_kg = await self._repo.section_n_scrap_sold(project_id, month_end)

        a_by_dia = _sum_by_dia(section_a, "total_received_kg")
        b_by_dia = _sum_by_dia(section_b, "total_transferred_kg")
        c_by_dia = {
            dia: a_by_dia.get(dia, Decimal("0")) - b_by_dia.get(dia, Decimal("0"))
            for dia in set(a_by_dia) | set(b_by_dia)
        }

        e_by_dia = _sum_by_dia(section_e, "consumption_kg")
        f_by_dia = _sum_by_dia(section_f, "wip_kg")
        g_by_dia = {
            dia: e_by_dia.get(dia, Decimal("0")) + f_by_dia.get(dia, Decimal("0"))
            for dia in set(e_by_dia) | set(f_by_dia)
        }

        h_by_dia = {
            dia: c_by_dia.get(dia, Decimal("0")) - g_by_dia.get(dia, Decimal("0"))
            for dia in set(c_by_dia) | set(g_by_dia)
        }

        # K = I + J + MyHome-yard stock (migration 0010). myhome_by_dia is {}
        # for every project that has never recorded MyHome stock, so K is
        # numerically unchanged (still I + J) for all existing data --
        # this only adds a third bucket when a QS actually uses it.
        k_by_dia = _sum_by_dia(sections_ij, "total_physical_kg")
        k_by_dia = {
            dia: k_by_dia.get(dia, Decimal("0")) + myhome_by_dia.get(dia, Decimal("0"))
            for dia in set(k_by_dia) | set(myhome_by_dia)
        }

        l_by_dia = {
            dia: h_by_dia.get(dia, Decimal("0")) - k_by_dia.get(dia, Decimal("0"))
            for dia in set(h_by_dia) | set(k_by_dia)
        }

        # M = L/G (Wastage Qty / Consumption+WIP), on TOTALS across all dia.
        # CORRECTED 2026-07-16: this was previously K/G (physical stock /
        # consumption+WIP), a guess flagged from the start as "the legacy
        # sheet's own formula, never confirmed". The real formula was found
        # in the company-wide "Copy of Recon Steel" consolidated workbook's
        # own Abstract sheet: its stated monthly wastage% for APAS (e.g.
        # 4.8176% for Feb-2026) reproduces exactly as
        # (Theoretical stock - Physical stock) / (Consumption+WIP) = L/G --
        # i.e. wastage as a fraction of what was actually used, not physical
        # stock remaining as a fraction of what was used. Verified against
        # that file's own row labels ("Wastage = Difference in Theoretical
        # stock - Physical stock", "% Wastage = G/E%" where their G is this
        # Wastage Qty and their E is Consumption+WIP) and their numbers
        # reproduce to 4 decimal places.
        total_l = sum(l_by_dia.values(), Decimal("0"))
        total_g = sum(g_by_dia.values(), Decimal("0"))
        m_wastage_pct = (total_l / total_g * 100) if total_g != 0 else None

        d_by_dia = _sum_by_dia(section_d, "net_issued_kg")
        findings = (
            await self._compute_findings(
                project_id, month_end, g_by_dia, l_by_dia, m_wastage_pct, scrap_kg,
                c_by_dia=c_by_dia, d_by_dia=d_by_dia,
            )
            if with_findings
            else []
        )

        return AbstractResponse(
            project_id=str(project_id),
            year=year,
            month=month,
            period_label=f"{year}-{month:02d}",
            section_a_received=section_a,
            section_b_transferred=section_b,
            section_c_net_received=c_by_dia,
            section_d_issued=section_d,
            section_e_consumption=section_e,
            section_f_wip=section_f,
            section_g_consumption_plus_wip=g_by_dia,
            section_h_theoretical_stock=h_by_dia,
            sections_ij_physical_stock=sections_ij,
            section_myhome_stock=myhome_by_dia,
            section_k_total_physical=k_by_dia,
            section_l_wastage_qty=l_by_dia,
            section_m_wastage_pct=m_wastage_pct,
            section_n_scrap_sold_kg=scrap_kg,
            findings=findings,
            pipeline_version=PIPELINE_VERSION,
        )

    # Aggregate cross-checks over the whole computed Abstract -- the per-entry
    # rules (issue>stock, JMR-vs-BBS, ...) fire row by row at save time; these
    # catch what only shows in the totals. Advisory presentation: they never
    # block viewing the Abstract, they name what doesn't reconcile.
    #
    # Aggregate tolerance is 10%, matching the per-entry JMR-vs-BBS default --
    # the entry rule tolerates each element drifting 10%, so the sum may
    # legitimately drift up to the same fraction before it means anything new.
    AGGREGATE_TOLERANCE = Decimal("0.10")

    async def _compute_findings(
        self,
        project_id: uuid.UUID,
        month_end: date,
        g_by_dia: dict[str, Decimal],
        l_by_dia: dict[str, Decimal],
        m_wastage_pct: Decimal | None,
        scrap_sold_kg: Decimal,
        c_by_dia: dict[str, Decimal] | None = None,
        d_by_dia: dict[str, Decimal] | None = None,
    ) -> list[dict]:
        findings: list[dict] = []

        # 0. THE core catch (plan §3.2): issued (D) must never exceed net
        # received (C) -- you cannot hand a contractor steel you never took
        # in. The legacy Excel sets D=C by formula so this is structurally
        # invisible there; here D is a genuine sum of issue rows and C a
        # genuine sum of receipts, so a real D>C surfaces. It means either
        # receipts are under-recorded (e.g. inter-site steel not in SAP) or
        # issues are overstated -- both worth money, both must be explained.
        if c_by_dia is not None and d_by_dia is not None:
            c_total = sum(c_by_dia.values(), Decimal("0"))
            d_total = sum(d_by_dia.values(), Decimal("0"))
            if d_total > c_total + Decimal("1"):  # 1kg float-noise guard
                findings.append({
                    "rule": "issued_exceeds_net_received",
                    "severity": "critical",
                    "dia": None,
                    "actual_kg": str(d_total),
                    "threshold_kg": str(c_total),
                    "message": (
                        f"Issued to contractors ({d_total/1000:.2f} MT) exceeds net received "
                        f"({c_total/1000:.2f} MT) by {(d_total-c_total)/1000:.2f} MT -- physically "
                        "impossible. Either receipts are under-recorded (inter-site steel not in "
                        "SAP?) or issues are overstated. The legacy Excel's D=C formula hides this."
                    ),
                })

        # 1. Consumption + WIP vs total BBS plan, per dia. Two distinct
        # failure shapes: booked steel exceeds everything that was ever
        # planned for that dia, or steel is booked against a dia with no
        # plan imported at all (unverifiable, which is itself a finding).
        planned_by_dia = await self._repo.total_bbs_planned(project_id)
        for dia, g_kg in sorted(g_by_dia.items()):
            if g_kg <= 0:
                continue
            planned = planned_by_dia.get(dia, Decimal("0"))
            if planned <= 0:
                findings.append({
                    "rule": "consumption_without_bbs_plan",
                    "severity": "warning",
                    "dia": dia,
                    "actual_kg": str(g_kg),
                    "threshold_kg": "0",
                    "message": (
                        f"{dia}mm: {g_kg}kg consumption+WIP is booked but no BBS plan "
                        "exists for this diameter -- nothing to verify it against"
                    ),
                })
            elif g_kg > planned * (1 + self.AGGREGATE_TOLERANCE):
                findings.append({
                    "rule": "consumption_wip_exceeds_bbs",
                    "severity": "warning",
                    "dia": dia,
                    "actual_kg": str(g_kg),
                    "threshold_kg": str(planned),
                    "message": (
                        f"{dia}mm: consumption+WIP ({g_kg}kg) exceeds the total "
                        f"BBS-planned quantity ({planned}kg) beyond the "
                        f"{self.AGGREGATE_TOLERANCE * 100:.0f}% tolerance"
                    ),
                })

        # 2. Wastage % vs the contract cap -- previously display-only (a red
        # dashboard KPI); as a finding it is part of the Abstract itself.
        cap = await self._repo.contract_wastage_cap_pct(project_id)
        if m_wastage_pct is not None and cap is not None and m_wastage_pct > cap:
            findings.append({
                "rule": "wastage_over_contract_cap",
                "severity": "warning",
                "dia": None,
                "actual_kg": str(m_wastage_pct),
                "threshold_kg": str(cap),
                "message": (
                    f"Wastage {m_wastage_pct:.2f}% is over the contractual "
                    f"{cap}% cap -- the excess is deductible from the contractor's RA bill"
                ),
            })

        # 3. Scrap sold vs scrap plausibly generated: wastage (L, clamped at
        # zero per dia -- negative L means a data problem, not negative scrap)
        # plus scrap-classified cut pieces. Selling more than that is the
        # classic leakage shape.
        cut_by_class = await self._repo.cut_piece_kg_by_classification(project_id, month_end)
        scrap_generated = sum(
            (max(v, Decimal("0")) for v in l_by_dia.values()), Decimal("0")
        ) + cut_by_class.get("scrap", Decimal("0"))
        if scrap_sold_kg > scrap_generated:
            findings.append({
                "rule": "scrap_sold_exceeds_generated",
                "severity": "warning",
                "dia": None,
                "actual_kg": str(scrap_sold_kg),
                "threshold_kg": str(scrap_generated),
                "message": (
                    f"Scrap sold ({scrap_sold_kg}kg) exceeds scrap plausibly generated "
                    f"({scrap_generated}kg = wastage + scrap-classified cut pieces) -- "
                    "either sales are overstated or wastage/cut-piece records are missing"
                ),
            })

        # 4. Safety-steel classification vs the imported safety backup: the
        # classification is self-declared at physical count; the backup
        # workbook is what makes it verifiable.
        safety_claimed = cut_by_class.get("used_as_safety_steel", Decimal("0"))
        if safety_claimed > 0:
            safety_backup = await self._repo.safety_backup_planned_kg(project_id)
            if safety_backup <= 0:
                findings.append({
                    "rule": "safety_steel_unverifiable",
                    "severity": "warning",
                    "dia": None,
                    "actual_kg": str(safety_claimed),
                    "threshold_kg": "0",
                    "message": (
                        f"{safety_claimed}kg of cut pieces are classified 'used as safety steel' "
                        "but no safety-steel backup workbook has been imported to verify against"
                    ),
                })
            elif safety_claimed > safety_backup * (1 + self.AGGREGATE_TOLERANCE):
                findings.append({
                    "rule": "safety_steel_exceeds_backup",
                    "severity": "warning",
                    "dia": None,
                    "actual_kg": str(safety_claimed),
                    "threshold_kg": str(safety_backup),
                    "message": (
                        f"Cut pieces classified as safety steel ({safety_claimed}kg) exceed "
                        f"the safety-steel backup total ({safety_backup}kg) beyond tolerance -- "
                        "safety classification may be hiding wastage"
                    ),
                })

        return findings
