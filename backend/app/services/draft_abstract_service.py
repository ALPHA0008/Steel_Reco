import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.abstract_repository import AbstractRepository
from app.schemas.abstract import DraftAbstractRequest, DraftAbstractResponse


def _add(*maps: dict[str, Decimal]) -> dict[str, Decimal]:
    dias = set()
    for m in maps:
        dias |= set(m)
    return {dia: sum((m.get(dia, Decimal("0")) for m in maps), Decimal("0")) for dia in dias}


def _sub(a: dict[str, Decimal], b: dict[str, Decimal]) -> dict[str, Decimal]:
    dias = set(a) | set(b)
    return {dia: a.get(dia, Decimal("0")) - b.get(dia, Decimal("0")) for dia in dias}


class DraftAbstractService:
    """Quick Draft: someone who already knows the Abstract's A/B/D/E/F/I/J/N
    numbers (no ledger rows behind them -- they aren't uploading documents,
    just typing what they know) gets the SAME derivation and the SAME
    plausibility rules AbstractService.compute() runs, minus the parts that
    genuinely require ledger rows (per-diameter BBS-plan cross-check, safety-
    steel backup). Never writes anything -- this is a scratch calculation
    the QS can immediately see verified or challenged, not an official
    Abstract. cap_pct comes from the request (typed or defaulted), not the
    project's real contract, so this works even before a project exists.
    """

    AGGREGATE_TOLERANCE = Decimal("0.10")  # matches AbstractService's own tolerance

    def __init__(self, session: AsyncSession) -> None:
        self._repo = AbstractRepository(session)

    async def compute(
        self, req: DraftAbstractRequest, *, check_against_project: uuid.UUID | None = None
    ) -> DraftAbstractResponse:
        c_by_dia = _sub(req.section_a_received, req.section_b_transferred)
        g_by_dia = _add(req.section_e_consumption, req.section_f_wip)
        h_by_dia = _sub(c_by_dia, g_by_dia)
        k_by_dia = _add(req.section_i_physical_full_length, req.section_j_physical_cut_pieces, req.section_myhome_stock)
        l_by_dia = _sub(h_by_dia, k_by_dia)

        total_l = sum(l_by_dia.values(), Decimal("0"))
        total_g = sum(g_by_dia.values(), Decimal("0"))
        m_wastage_pct = (total_l / total_g * 100) if total_g != 0 else None

        findings = self._common_sense_findings(req, c_by_dia, g_by_dia, l_by_dia, m_wastage_pct)

        # Optional: cross-check the typed consumption+WIP against this real
        # project's actual BBS plan totals, the same aggregate rule
        # AbstractService runs -- only meaningful if the caller IS looking at
        # a real project (a draft can also be run with no project context).
        if check_against_project is not None:
            findings += await self._bbs_plan_findings(check_against_project, g_by_dia)

        return DraftAbstractResponse(
            period_label=req.period_label,
            section_c_net_received=c_by_dia,
            section_g_consumption_plus_wip=g_by_dia,
            section_h_theoretical_stock=h_by_dia,
            section_k_total_physical=k_by_dia,
            section_l_wastage_qty=l_by_dia,
            section_m_wastage_pct=m_wastage_pct,
            findings=findings,
        )

    def _common_sense_findings(
        self,
        req: DraftAbstractRequest,
        c_by_dia: dict[str, Decimal],
        g_by_dia: dict[str, Decimal],
        l_by_dia: dict[str, Decimal],
        m_wastage_pct: Decimal | None,
    ) -> list[dict]:
        findings: list[dict] = []

        # 1. The core catch (same as the real Abstract): issued can't exceed
        # net received -- you cannot hand out steel you never took in.
        c_total = sum(c_by_dia.values(), Decimal("0"))
        d_total = sum(req.section_d_issued.values(), Decimal("0"))
        if d_total > c_total + Decimal("1"):
            findings.append({
                "rule": "issued_exceeds_net_received",
                "severity": "critical",
                "dia": None,
                "actual_kg": str(d_total),
                "threshold_kg": str(c_total),
                "message": (
                    f"Issued to contractors ({d_total/1000:.2f} MT) exceeds net received "
                    f"({c_total/1000:.2f} MT) by {(d_total-c_total)/1000:.2f} MT -- physically "
                    "impossible. Check A (Received) and B (Transferred out) against D (Issued)."
                ),
            })

        # 2. Wastage % vs cap.
        if m_wastage_pct is not None and m_wastage_pct > req.cap_pct:
            findings.append({
                "rule": "wastage_over_contract_cap",
                "severity": "warning",
                "dia": None,
                "actual_kg": str(m_wastage_pct),
                "threshold_kg": str(req.cap_pct),
                "message": (
                    f"Wastage {m_wastage_pct:.2f}% is over the {req.cap_pct}% cap you entered -- "
                    "the excess would be deductible from the contractor's RA bill"
                ),
            })

        # 3. Scrap sold vs. scrap plausibly generated (positive wastage only --
        # negative L per dia means a data problem, not negative scrap).
        scrap_generated = sum((max(v, Decimal("0")) for v in l_by_dia.values()), Decimal("0"))
        if req.section_n_scrap_sold_kg > scrap_generated:
            findings.append({
                "rule": "scrap_sold_exceeds_generated",
                "severity": "warning",
                "dia": None,
                "actual_kg": str(req.section_n_scrap_sold_kg),
                "threshold_kg": str(scrap_generated),
                "message": (
                    f"Scrap sold ({req.section_n_scrap_sold_kg}kg) exceeds scrap plausibly "
                    f"generated from wastage ({scrap_generated}kg) -- either N is overstated or "
                    "wastage (H-K) is understated"
                ),
            })

        # 4. Per-dia sanity: negative net-received or negative consumption+WIP
        # is a straightforward sign/entry error (A<B or E+F typed backwards),
        # not a real business condition -- flag it immediately rather than
        # let it cascade into a nonsensical wastage %.
        for dia, c_val in sorted(c_by_dia.items(), key=lambda kv: float(kv[0])):
            if c_val < 0:
                findings.append({
                    "rule": "negative_net_received",
                    "severity": "critical",
                    "dia": dia,
                    "actual_kg": str(c_val),
                    "threshold_kg": "0",
                    "message": f"{dia}mm: Net Received (A-B) is negative ({c_val}kg) -- Transferred out exceeds Received for this diameter",
                })
        for dia, g_val in sorted(g_by_dia.items(), key=lambda kv: float(kv[0])):
            if g_val < 0:
                findings.append({
                    "rule": "negative_consumption_wip",
                    "severity": "critical",
                    "dia": dia,
                    "actual_kg": str(g_val),
                    "threshold_kg": "0",
                    "message": f"{dia}mm: Consumption+WIP (E+F) is negative ({g_val}kg) -- check E and F for this diameter",
                })

        # 5. Per-dia wastage outlier: a single diameter wasting far more than
        # the portfolio average is the classic sign of a typo (e.g. an extra
        # digit) rather than genuine wastage -- flagged as advisory, not
        # blocking, since it can be real.
        for dia in sorted(l_by_dia, key=lambda x: float(x)):
            g_val = g_by_dia.get(dia, Decimal("0"))
            if g_val <= 0:
                continue
            dia_pct = (l_by_dia[dia] / g_val * 100) if g_val else Decimal("0")
            if m_wastage_pct is not None and dia_pct > max(m_wastage_pct * 3, req.cap_pct * 5):
                findings.append({
                    "rule": "dia_wastage_outlier",
                    "severity": "warning",
                    "dia": dia,
                    "actual_kg": str(dia_pct),
                    "threshold_kg": str(m_wastage_pct),
                    "message": (
                        f"{dia}mm: wastage ({dia_pct:.1f}%) is far above the portfolio average "
                        f"({m_wastage_pct:.2f}%) -- worth double-checking this diameter's I/J/H figures for a typo"
                    ),
                })

        return findings

    async def _bbs_plan_findings(self, project_id: uuid.UUID, g_by_dia: dict[str, Decimal]) -> list[dict]:
        planned_by_dia = await self._repo.total_bbs_planned(project_id)
        findings: list[dict] = []
        for dia, g_kg in sorted(g_by_dia.items(), key=lambda kv: float(kv[0])):
            if g_kg <= 0:
                continue
            planned = planned_by_dia.get(dia, Decimal("0"))
            if planned <= 0:
                continue  # no plan imported for this dia -- not the draft's job to flag data-import gaps
            if g_kg > planned * (1 + self.AGGREGATE_TOLERANCE):
                findings.append({
                    "rule": "consumption_wip_exceeds_bbs",
                    "severity": "warning",
                    "dia": dia,
                    "actual_kg": str(g_kg),
                    "threshold_kg": str(planned),
                    "message": (
                        f"{dia}mm: your typed consumption+WIP ({g_kg}kg) exceeds this project's real "
                        f"BBS-planned quantity ({planned}kg) by more than {self.AGGREGATE_TOLERANCE * 100:.0f}% -- "
                        "worth re-checking against the actual ledger"
                    ),
                })
        return findings
