import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class AbstractRepository:
    """ALL A-N section queries (plan §4/§5.1). One method per source table,
    matching the plan's SQL exactly -- month_start/month_end are computed by
    the caller (AbstractService), never date_trunc() in the WHERE clause, so
    every query is sargable against the {project_id, effective_date, dia_grade_id}
    indexes (plan §3.4's indexing note).

    Every section returns per-dia totals in KG (canonical unit, plan §0);
    MT conversion happens at presentation, not here.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def section_a_received(
        self, project_id: uuid.UUID, month_start: date, month_end: date
    ) -> list[dict]:
        """Section A: grn grouped by dia x receipt_type."""
        result = await self.session.execute(
            text(
                """
                SELECT dg.diameter_mm AS dia,
                       SUM(g.weighbridge_weight_kg) FILTER (WHERE g.receipt_type = 'against_po') AS against_po_kg,
                       SUM(g.weighbridge_weight_kg) FILTER (WHERE g.receipt_type = 'other_site_sap') AS other_site_sap_kg,
                       SUM(g.weighbridge_weight_kg) FILTER (WHERE g.receipt_type = 'other_site_excel') AS other_site_excel_kg,
                       SUM(g.weighbridge_weight_kg) AS total_received_kg
                FROM grn g JOIN dia_grades dg ON dg.id = g.dia_grade_id
                WHERE g.project_id = :pid
                  AND g.effective_date >= :month_start AND g.effective_date < :month_end
                GROUP BY dg.diameter_mm
                ORDER BY dg.diameter_mm
                """
            ),
            {"pid": project_id, "month_start": month_start, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def section_b_transferred(
        self, project_id: uuid.UUID, month_start: date, month_end: date
    ) -> list[dict]:
        """Section B: inter_site_transfer (flag=loan, outbound) by dia x record_source."""
        result = await self.session.execute(
            text(
                """
                SELECT dg.diameter_mm AS dia,
                       SUM(t.quantity_kg) FILTER (WHERE t.record_source = 'sap') AS transfer_sap_kg,
                       SUM(t.quantity_kg) FILTER (WHERE t.record_source = 'excel') AS transfer_excel_kg,
                       SUM(t.quantity_kg) AS total_transferred_kg
                FROM inter_site_transfer t JOIN dia_grades dg ON dg.id = t.dia_grade_id
                WHERE t.from_project_id = :pid AND t.flag = 'loan'
                  AND t.effective_date >= :month_start AND t.effective_date < :month_end
                GROUP BY dg.diameter_mm
                ORDER BY dg.diameter_mm
                """
            ),
            {"pid": project_id, "month_start": month_start, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def section_d_issued(
        self, project_id: uuid.UUID, month_start: date, month_end: date
    ) -> list[dict]:
        """Section D: store_issue SUM(out) - SUM(in) per dia x contractor --
        the core bug fix (plan §3.2). Genuinely summed from issue rows, never
        derived from section C.
        """
        result = await self.session.execute(
            text(
                """
                SELECT dg.diameter_mm AS dia, si.contractor_id, c.name AS contractor_name,
                       SUM(si.quantity_kg) FILTER (WHERE si.direction = 'out') AS issued_out_kg,
                       SUM(si.quantity_kg) FILTER (WHERE si.direction = 'in') AS returned_in_kg,
                       SUM(si.quantity_kg) FILTER (WHERE si.direction = 'out')
                         - COALESCE(SUM(si.quantity_kg) FILTER (WHERE si.direction = 'in'), 0) AS net_issued_kg
                FROM store_issue si
                  JOIN dia_grades dg ON dg.id = si.dia_grade_id
                  JOIN contractors c ON c.id = si.contractor_id
                WHERE si.project_id = :pid
                  AND si.effective_date >= :month_start AND si.effective_date < :month_end
                GROUP BY dg.diameter_mm, si.contractor_id, c.name
                ORDER BY dg.diameter_mm, c.name
                """
            ),
            {"pid": project_id, "month_start": month_start, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def section_e_consumption(
        self, project_id: uuid.UUID, month_start: date, month_end: date
    ) -> list[dict]:
        """Section E: Sigma jmr_actual.measured_weight_kg by dia x contractor
        (plan §4 -- traced to the real per-tower pour-row formulas; jmr_actual
        is the schema's landing spot for that per-tower detail once the
        external STEEL ABSTRACT workbooks are parsed, per §11 item 1).
        """
        result = await self.session.execute(
            text(
                """
                SELECT dg.diameter_mm AS dia, j.contractor_id, c.name AS contractor_name,
                       SUM(j.measured_weight_kg) AS consumption_kg
                FROM jmr_actual j
                  JOIN dia_grades dg ON dg.id = j.dia_grade_id
                  LEFT JOIN contractors c ON c.id = j.contractor_id
                WHERE j.project_id = :pid
                  AND j.effective_date >= :month_start AND j.effective_date < :month_end
                GROUP BY dg.diameter_mm, j.contractor_id, c.name
                ORDER BY dg.diameter_mm
                """
            ),
            {"pid": project_id, "month_start": month_start, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def section_f_wip(self, project_id: uuid.UUID, month_end: date) -> list[dict]:
        """Section F: Sigma bbs_plan.planned_weight_kg x element_progress.completion_pct
        per in-progress element (plan §3.2/§4 -- the legacy sheet's observed
        x50% literal, now real captured data). Uses the LATEST completion_pct
        per element as of month_end, same 'latest, not summed' pattern as
        physical_count (section I/J).
        """
        result = await self.session.execute(
            text(
                """
                WITH latest_progress AS (
                    SELECT DISTINCT ON (element_id) element_id, completion_pct
                    FROM element_progress
                    WHERE project_id = :pid AND as_of_date <= :month_end
                    ORDER BY element_id, as_of_date DESC
                )
                SELECT dg.diameter_mm AS dia, bp.contractor_id,
                       SUM(bp.planned_weight_kg * lp.completion_pct / 100.0) AS wip_kg
                FROM bbs_plan bp
                  JOIN dia_grades dg ON dg.id = bp.dia_grade_id
                  JOIN latest_progress lp ON lp.element_id = bp.element_id
                WHERE bp.project_id = :pid AND bp.element_id IS NOT NULL
                GROUP BY dg.diameter_mm, bp.contractor_id
                ORDER BY dg.diameter_mm
                """
            ),
            {"pid": project_id, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def sections_ij_physical_stock(self, project_id: uuid.UUID, month_end: date) -> list[dict]:
        """Sections I/J: physical stock is the LATEST count per contractor+dia
        up to month_end, never a sum (plan §4). J splits cut pieces by
        classification -- reusable/used_as_safety_steel count as stock, scrap
        does not (it flows to wastage/scrap-sold instead).
        """
        result = await self.session.execute(
            text(
                """
                WITH latest AS (
                    SELECT DISTINCT ON (contractor_id, dia_grade_id) *
                    FROM physical_count
                    WHERE project_id = :pid AND effective_date <= :month_end
                    ORDER BY contractor_id, dia_grade_id, effective_date DESC
                ),
                full_length AS (
                    SELECT l.id, l.contractor_id, l.dia_grade_id,
                           COALESCE(l.bundle_count, 0) * COALESCE(l.each_bundle_weight_kg, 0)
                             + COALESCE(l.loose_rod_count, 0) * COALESCE(l.each_rod_weight_kg, 0)
                             AS full_length_kg
                    FROM latest l
                ),
                cut_piece_stock AS (
                    SELECT l.id,
                           COALESCE(SUM(cp.nos * cp.weight_kg) FILTER (
                               WHERE cp.classification IN ('reusable', 'used_as_safety_steel')
                           ), 0) AS cut_piece_stock_kg,
                           COALESCE(SUM(cp.nos * cp.weight_kg) FILTER (
                               WHERE cp.classification = 'scrap'
                           ), 0) AS cut_piece_scrap_kg
                    FROM latest l
                    LEFT JOIN physical_count_cut_piece cp ON cp.physical_count_id = l.id
                    GROUP BY l.id
                )
                SELECT dg.diameter_mm AS dia, fl.contractor_id,
                       fl.full_length_kg,
                       cps.cut_piece_stock_kg,
                       cps.cut_piece_scrap_kg,
                       fl.full_length_kg + cps.cut_piece_stock_kg AS total_physical_kg
                FROM full_length fl
                  JOIN dia_grades dg ON dg.id = fl.dia_grade_id
                  JOIN cut_piece_stock cps ON cps.id = fl.id
                ORDER BY dg.diameter_mm
                """
            ),
            {"pid": project_id, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def section_n_scrap_sold(
        self, project_id: uuid.UUID, month_start: date, month_end: date
    ) -> Decimal:
        """Section N: scrap_sale totals (project-wide, not per-dia -- the
        real scrap register is mixed-dia per sale, plan's data-model notes)."""
        result = await self.session.execute(
            text(
                """
                SELECT COALESCE(SUM(weight_kg), 0) AS total_scrap_kg
                FROM scrap_sale
                WHERE project_id = :pid
                  AND effective_date >= :month_start AND effective_date < :month_end
                """
            ),
            {"pid": project_id, "month_start": month_start, "month_end": month_end},
        )
        return result.scalar_one()

    async def bbs_vs_jmr_comparison(self, project_id: uuid.UUID) -> list[dict]:
        """BBS-planned vs JMR-actual side by side per tower/floor/dia (PRD
        story #13) -- the two systems that 'only meet in the QS's head' now
        meet in a query (plan §4)."""
        result = await self.session.execute(
            text(
                """
                SELECT t.name AS tower_name, f.level_name AS floor_name, dg.diameter_mm AS dia,
                       COALESCE(bp.planned_kg, 0) AS planned_kg,
                       COALESCE(ja.actual_kg, 0) AS actual_kg
                FROM (
                    SELECT tower_id, floor_id, dia_grade_id, SUM(planned_weight_kg) AS planned_kg
                    FROM bbs_plan WHERE project_id = :pid GROUP BY tower_id, floor_id, dia_grade_id
                ) bp
                FULL OUTER JOIN (
                    SELECT tower_id, floor_id, dia_grade_id, SUM(measured_weight_kg) AS actual_kg
                    FROM jmr_actual WHERE project_id = :pid GROUP BY tower_id, floor_id, dia_grade_id
                ) ja ON ja.tower_id = bp.tower_id AND ja.floor_id = bp.floor_id
                     AND ja.dia_grade_id = bp.dia_grade_id
                JOIN dia_grades dg ON dg.id = COALESCE(bp.dia_grade_id, ja.dia_grade_id)
                JOIN towers t ON t.id = COALESCE(bp.tower_id, ja.tower_id)
                JOIN floors f ON f.id = COALESCE(bp.floor_id, ja.floor_id)
                ORDER BY t.name, f.level_name, dg.diameter_mm
                """
            ),
            {"pid": project_id},
        )
        return [dict(r._mapping) for r in result.fetchall()]
