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

    async def activity_bounds(self, project_id: uuid.UUID) -> dict:
        """Earliest and latest effective_date across every ledger table for
        this project. Used to bound the Abstract's period picker to months
        that actually have data -- the cumulative-ledger design (no
        month_start) means any period after the latest real entry returns
        identical totals to that latest entry, which looks like a distinct
        month's Abstract but isn't; the picker must not let that happen by
        accident.
        """
        result = await self.session.execute(
            text(
                """
                SELECT MIN(d) AS earliest, MAX(d) AS latest FROM (
                    SELECT effective_date AS d FROM grn WHERE project_id = :pid
                    UNION ALL
                    SELECT effective_date FROM inter_site_transfer
                        WHERE from_project_id = :pid OR to_project_id = :pid
                    UNION ALL
                    SELECT effective_date FROM store_issue WHERE project_id = :pid
                    UNION ALL
                    SELECT effective_date FROM jmr_actual WHERE project_id = :pid
                    UNION ALL
                    SELECT effective_date FROM physical_count WHERE project_id = :pid
                    UNION ALL
                    SELECT effective_date FROM scrap_sale WHERE project_id = :pid
                ) all_dates
                """
            ),
            {"pid": project_id},
        )
        row = result.fetchone()
        return {"earliest": row.earliest, "latest": row.latest}

    async def section_a_received(self, project_id: uuid.UUID, month_end: date) -> list[dict]:
        """Section A: grn grouped by dia x receipt_type. Cumulative from
        project start through month_end (no month_start bound) -- the
        Abstract has no opening-balance concept (plan's cumulative-ledger
        decision; the real Excel's own A totals the full history, not one
        month). Fixed 2026-07-14: this and B/D/E/N previously bucketed to a
        single month, contradicting that decision and making the live
        Abstract structurally incomparable to the Excel.
        """
        result = await self.session.execute(
            text(
                """
                SELECT dg.diameter_mm AS dia,
                       SUM(g.weighbridge_weight_kg) FILTER (WHERE g.receipt_type = 'against_po') AS against_po_kg,
                       SUM(g.weighbridge_weight_kg) FILTER (WHERE g.receipt_type = 'other_site_sap') AS other_site_sap_kg,
                       SUM(g.weighbridge_weight_kg) FILTER (WHERE g.receipt_type = 'other_site_excel') AS other_site_excel_kg,
                       SUM(g.weighbridge_weight_kg) AS total_received_kg
                FROM grn g JOIN dia_grades dg ON dg.id = g.dia_grade_id
                WHERE g.project_id = :pid AND g.effective_date < :month_end
                GROUP BY dg.diameter_mm
                ORDER BY dg.diameter_mm
                """
            ),
            {"pid": project_id, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def section_b_transferred(self, project_id: uuid.UUID, month_end: date) -> list[dict]:
        """Section B: inter_site_transfer (flag=loan, outbound) by dia x record_source.
        Cumulative through month_end -- see section_a_received's note."""
        result = await self.session.execute(
            text(
                """
                SELECT dg.diameter_mm AS dia,
                       SUM(t.quantity_kg) FILTER (WHERE t.record_source = 'sap') AS transfer_sap_kg,
                       SUM(t.quantity_kg) FILTER (WHERE t.record_source = 'excel') AS transfer_excel_kg,
                       SUM(t.quantity_kg) AS total_transferred_kg
                FROM inter_site_transfer t JOIN dia_grades dg ON dg.id = t.dia_grade_id
                WHERE t.from_project_id = :pid AND t.flag = 'loan' AND t.effective_date < :month_end
                GROUP BY dg.diameter_mm
                ORDER BY dg.diameter_mm
                """
            ),
            {"pid": project_id, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def section_d_issued(self, project_id: uuid.UUID, month_end: date) -> list[dict]:
        """Section D: store_issue SUM(out) - SUM(in) per dia x contractor --
        the core bug fix (plan §3.2). Genuinely summed from issue rows, never
        derived from section C. Cumulative through month_end -- see
        section_a_received's note.
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
                WHERE si.project_id = :pid AND si.effective_date < :month_end
                GROUP BY dg.diameter_mm, si.contractor_id, c.name
                ORDER BY dg.diameter_mm, c.name
                """
            ),
            {"pid": project_id, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def section_e_consumption(self, project_id: uuid.UUID, month_end: date) -> list[dict]:
        """Section E: Sigma jmr_actual.measured_weight_kg by dia x contractor
        (plan §4 -- traced to the real per-tower pour-row formulas; jmr_actual
        is the schema's landing spot for that per-tower detail once the
        external STEEL ABSTRACT workbooks are parsed, per §11 item 1).
        Cumulative through month_end -- see section_a_received's note.

        Superseded rows (those another row corrects via corrected_from_id) are
        excluded -- a corrected measurement is replaced, not added to. Same
        predicate as JmrActualRepository._NOT_SUPERSEDED; keep them in sync.
        """
        result = await self.session.execute(
            text(
                """
                SELECT dg.diameter_mm AS dia, j.contractor_id, c.name AS contractor_name,
                       SUM(j.measured_weight_kg) AS consumption_kg
                FROM jmr_actual j
                  JOIN dia_grades dg ON dg.id = j.dia_grade_id
                  LEFT JOIN contractors c ON c.id = j.contractor_id
                WHERE j.project_id = :pid AND j.effective_date < :month_end
                  AND NOT EXISTS (SELECT 1 FROM jmr_actual j2 WHERE j2.corrected_from_id = j.id)
                GROUP BY dg.diameter_mm, j.contractor_id, c.name
                ORDER BY dg.diameter_mm
                """
            ),
            {"pid": project_id, "month_end": month_end},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def section_f_wip(self, project_id: uuid.UUID, month_end: date) -> list[dict]:
        """Section F: Sigma bbs_plan.planned_weight_kg x element_progress.completion_pct
        per in-progress element (plan §3.2/§4 -- the legacy sheet's observed
        x50% literal, now real captured data). Uses the LATEST completion_pct
        per element as of month_end, same 'latest, not summed' pattern as
        physical_count (section I/J).

        An element with an ACTIVE JMR row is excluded entirely: WIP means
        'cast but not yet jointly measured' (the legacy sheet's semantics --
        pours move from WIP to Consumption once measured). Without this, the
        same element's steel counts in E via its JMR AND in F via its
        completion %, double-counting it in G (fixed 2026-07-14).
        """
        result = await self.session.execute(
            text(
                """
                WITH latest_progress AS (
                    SELECT DISTINCT ON (element_id) element_id, completion_pct
                    FROM element_progress
                    WHERE project_id = :pid AND as_of_date < :month_end
                    ORDER BY element_id, as_of_date DESC, id DESC
                )
                SELECT dg.diameter_mm AS dia, bp.contractor_id,
                       SUM(bp.planned_weight_kg * lp.completion_pct / 100.0) AS wip_kg
                FROM bbs_plan bp
                  JOIN dia_grades dg ON dg.id = bp.dia_grade_id
                  JOIN latest_progress lp ON lp.element_id = bp.element_id
                WHERE bp.project_id = :pid AND bp.element_id IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM jmr_actual ja
                      WHERE ja.element_id = bp.element_id
                        AND ja.effective_date < :month_end
                        AND NOT EXISTS (
                            SELECT 1 FROM jmr_actual ja2 WHERE ja2.corrected_from_id = ja.id
                        )
                  )
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
                    WHERE project_id = :pid AND effective_date < :month_end
                    ORDER BY contractor_id, dia_grade_id, effective_date DESC, id DESC
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
                           ), 0) AS cut_piece_scrap_kg,
                           -- Breakout only (display), already counted inside
                           -- cut_piece_stock_kg above -- never double-add this.
                           COALESCE(SUM(cp.nos * cp.weight_kg) FILTER (
                               WHERE cp.classification = 'used_as_safety_steel'
                           ), 0) AS safety_steel_kg
                    FROM latest l
                    LEFT JOIN physical_count_cut_piece cp ON cp.physical_count_id = l.id
                    GROUP BY l.id
                )
                SELECT dg.diameter_mm AS dia, fl.contractor_id,
                       fl.full_length_kg,
                       cps.cut_piece_stock_kg,
                       cps.cut_piece_scrap_kg,
                       cps.safety_steel_kg,
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

    async def myhome_stock_by_dia(self, project_id: uuid.UUID, month_end: date) -> dict[str, Decimal]:
        """MyHome-yard stock bucket: the LATEST snapshot per dia up to
        month_end, never summed -- same rule as sections I/J above (migration
        0010). Rolls into Total Physical (K) alongside contractor-held stock."""
        result = await self.session.execute(
            text(
                """
                SELECT DISTINCT ON (ms.dia_grade_id) dg.diameter_mm AS dia, ms.qty_kg
                FROM myhome_stock ms JOIN dia_grades dg ON dg.id = ms.dia_grade_id
                WHERE ms.project_id = :pid AND ms.effective_date < :month_end
                ORDER BY ms.dia_grade_id, ms.effective_date DESC, ms.id DESC
                """
            ),
            {"pid": project_id, "month_end": month_end},
        )
        return {str(r.dia): r.qty_kg for r in result.fetchall()}

    async def section_n_scrap_sold(self, project_id: uuid.UUID, month_end: date) -> Decimal:
        """Section N: scrap_sale totals (project-wide, not per-dia -- the
        real scrap register is mixed-dia per sale, plan's data-model notes).
        Cumulative through month_end -- see section_a_received's note."""
        result = await self.session.execute(
            text(
                "SELECT COALESCE(SUM(weight_kg), 0) AS total_scrap_kg "
                "FROM scrap_sale WHERE project_id = :pid AND effective_date < :month_end"
            ),
            {"pid": project_id, "month_end": month_end},
        )
        return result.scalar_one()

    async def total_bbs_planned(self, project_id: uuid.UUID) -> dict[str, Decimal]:
        """Total BBS-planned kg per dia across the whole project -- the
        aggregate ceiling the consumption+WIP finding checks against (the
        per-element check happens at JMR entry; this catches drift that only
        shows in the totals, e.g. consumption booked against elements that
        have no plan at all)."""
        result = await self.session.execute(
            text(
                """
                SELECT dg.diameter_mm AS dia, SUM(bp.planned_weight_kg) AS planned_kg
                FROM bbs_plan bp JOIN dia_grades dg ON dg.id = bp.dia_grade_id
                WHERE bp.project_id = :pid
                GROUP BY dg.diameter_mm
                """
            ),
            {"pid": project_id},
        )
        return {str(r.dia): r.planned_kg for r in result.fetchall()}

    async def cut_piece_kg_by_classification(
        self, project_id: uuid.UUID, month_end: date
    ) -> dict[str, Decimal]:
        """{classification: total_kg} from the LATEST physical count per
        contractor+dia (same 'latest, not summed' rule as sections I/J)."""
        result = await self.session.execute(
            text(
                """
                WITH latest AS (
                    SELECT DISTINCT ON (contractor_id, dia_grade_id) id
                    FROM physical_count
                    WHERE project_id = :pid AND effective_date < :month_end
                    ORDER BY contractor_id, dia_grade_id, effective_date DESC, id DESC
                )
                SELECT cp.classification, COALESCE(SUM(cp.nos * cp.weight_kg), 0) AS total_kg
                FROM latest l JOIN physical_count_cut_piece cp ON cp.physical_count_id = l.id
                GROUP BY cp.classification
                """
            ),
            {"pid": project_id, "month_end": month_end},
        )
        return {r.classification: r.total_kg for r in result.fetchall()}

    async def safety_backup_planned_kg(self, project_id: uuid.UUID) -> Decimal:
        """Total planned safety-steel kg from imported backup workbooks --
        identified by source_file (the bulk importer stamps it; the real APAS
        backup is 'Misc Works Back Up/Steel Qty-Safety-...xlsx'). Zero means
        no safety backup has been imported yet."""
        result = await self.session.execute(
            text(
                "SELECT COALESCE(SUM(planned_weight_kg), 0) FROM bbs_plan "
                "WHERE project_id = :pid AND source_file ILIKE '%safety%'"
            ),
            {"pid": project_id},
        )
        return result.scalar_one()

    async def contract_wastage_cap_pct(self, project_id: uuid.UUID) -> Decimal | None:
        result = await self.session.execute(
            text("SELECT contract_wastage_pct FROM projects WHERE id = :pid"),
            {"pid": project_id},
        )
        return result.scalar_one_or_none()

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
                    FROM jmr_actual j WHERE project_id = :pid
                      AND NOT EXISTS (SELECT 1 FROM jmr_actual j2 WHERE j2.corrected_from_id = j.id)
                    GROUP BY tower_id, floor_id, dia_grade_id
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
