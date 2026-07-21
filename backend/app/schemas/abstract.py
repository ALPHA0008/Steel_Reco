from decimal import Decimal

from pydantic import BaseModel


class PeriodBoundsResponse(BaseModel):
    """Earliest and latest month with any real ledger activity for this
    project -- lets the frontend bound its month/year picker instead of
    letting a user land on a period with no data by accident. `null` for
    both means the project has no transactions at all yet.
    """

    earliest_year: int | None
    earliest_month: int | None
    latest_year: int | None
    latest_month: int | None


class WastageTrendPoint(BaseModel):
    """One month's CUMULATIVE wastage % (Section M), as of that month-end --
    each point re-runs the same live Abstract computation for that period,
    never a separately-tracked series (plan §0 invariant: no summary number
    is ever anything but freshly computed from the ledger)."""

    year: int
    month: int
    period_label: str
    wastage_pct: Decimal | None


class WastageTrendResponse(BaseModel):
    contract_wastage_cap_pct: Decimal
    points: list[WastageTrendPoint]


class AbstractResponse(BaseModel):
    """Sections A-N, all in KG (canonical unit, plan §0) keyed by diameter_mm
    as a string (Decimal isn't JSON-native). MT conversion is a frontend/export
    concern, not baked in here, per the plan's 'MT is a presentation concern.'
    """

    project_id: str
    year: int
    month: int
    period_label: str  # "2026-06"

    section_a_received: list[dict]
    section_b_transferred: list[dict]
    section_c_net_received: dict[str, Decimal]  # by dia: A - B
    section_d_issued: list[dict]
    section_e_consumption: list[dict]
    section_f_wip: list[dict]
    section_g_consumption_plus_wip: dict[str, Decimal]  # by dia: E + F
    section_h_theoretical_stock: dict[str, Decimal]  # by dia: C - G
    sections_ij_physical_stock: list[dict]
    section_k_total_physical: dict[str, Decimal]  # by dia: I + J (already in sections_ij row)
    section_l_wastage_qty: dict[str, Decimal]  # by dia: H - K
    section_m_wastage_pct: Decimal | None  # M = L / G, verified 2026-07-16 against the real business formula
    section_n_scrap_sold_kg: Decimal

    # Aggregate cross-checks computed over the whole Abstract (E+F vs BBS,
    # wastage vs contract cap, scrap sold vs generated, safety steel vs
    # backup) -- each {rule, severity, dia?, actual_kg, threshold_kg, message}.
    # Advisory: they annotate the Abstract, never block it.
    findings: list[dict]

    pipeline_version: str
