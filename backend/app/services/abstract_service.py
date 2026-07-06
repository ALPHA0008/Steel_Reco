import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.abstract_repository import AbstractRepository
from app.schemas.abstract import AbstractResponse

PIPELINE_VERSION = "abstract@v1"


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    """month_start/month_end as plain dates, computed here -- never
    date_trunc(...) in a WHERE clause (plan §3.4/§4's sargability note)."""
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, month + 1, 1)
    return month_start, month_end


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

    async def compute(self, project_id: uuid.UUID, year: int, month: int) -> AbstractResponse:
        month_start, month_end = _month_bounds(year, month)

        section_a = await self._repo.section_a_received(project_id, month_start, month_end)
        section_b = await self._repo.section_b_transferred(project_id, month_start, month_end)
        section_d = await self._repo.section_d_issued(project_id, month_start, month_end)
        section_e = await self._repo.section_e_consumption(project_id, month_start, month_end)
        section_f = await self._repo.section_f_wip(project_id, month_end)
        sections_ij = await self._repo.sections_ij_physical_stock(project_id, month_end)
        scrap_kg = await self._repo.section_n_scrap_sold(project_id, month_start, month_end)

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

        k_by_dia = _sum_by_dia(sections_ij, "total_physical_kg")

        l_by_dia = {
            dia: h_by_dia.get(dia, Decimal("0")) - k_by_dia.get(dia, Decimal("0"))
            for dia in set(h_by_dia) | set(k_by_dia)
        }

        # M = K/G exactly as the legacy sheet literally defines it (plan §4
        # note: physical stock / consumption+WIP, on TOTALS across all dia --
        # not the intuitive wastage/consumption. Flagged in the plan as
        # needing QS confirmation before being trusted; computed here as
        # specified so the number exists to compare against, not withheld.
        total_k = sum(k_by_dia.values(), Decimal("0"))
        total_g = sum(g_by_dia.values(), Decimal("0"))
        m_wastage_pct = (total_k / total_g * 100) if total_g != 0 else None

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
            section_k_total_physical=k_by_dia,
            section_l_wastage_qty=l_by_dia,
            section_m_wastage_pct=m_wastage_pct,
            section_n_scrap_sold_kg=scrap_kg,
            pipeline_version=PIPELINE_VERSION,
        )
