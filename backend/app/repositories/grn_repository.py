import uuid
from decimal import Decimal

from sqlalchemy import text

from app.models.transactions import Grn
from app.repositories.base import BaseRepository


class GrnRepository(BaseRepository[Grn]):
    model = Grn

    async def po_reference_summary(self, project_id: uuid.UUID) -> list[dict]:
        """Groups every GRN by its raw po_reference text -- makes the
        receiving structure visible even though no real purchase_order master
        data has been linked for this project yet (every GRN's po_id is NULL,
        so the inbound_reconciliation rule can't validate any of them). This
        is honest about what IS known (a PO number was written on the slip)
        vs what ISN'T (a linked, ordered-quantity record to check it against).
        """
        result = await self.session.execute(
            text(
                """
                SELECT COALESCE(po_reference, '(no PO reference recorded)') AS po_reference,
                       COUNT(*) AS grn_count,
                       COALESCE(SUM(weighbridge_weight_kg), 0) AS total_kg,
                       MIN(effective_date) AS first_date,
                       MAX(effective_date) AS last_date,
                       COUNT(*) FILTER (WHERE po_id IS NOT NULL) AS linked_count
                FROM grn
                WHERE project_id = :pid
                GROUP BY COALESCE(po_reference, '(no PO reference recorded)')
                ORDER BY total_kg DESC
                """
            ),
            {"pid": project_id},
        )
        return [dict(r._mapping) for r in result.fetchall()]

    async def cumulative_accepted_kg(self, po_id: uuid.UUID, dia_grade_id: uuid.UUID) -> Decimal:
        """Sum of weighbridge_weight_kg already received against this PO+dia --
        the PO-discipline check adds the incoming GRN's own qty on top and
        compares to the PO line's ordered_qty_kg (plan §3.5)."""
        result = await self.session.execute(
            text(
                "SELECT COALESCE(SUM(weighbridge_weight_kg), 0) AS total "
                "FROM grn WHERE po_id = :po_id AND dia_grade_id = :dia"
            ),
            {"po_id": po_id, "dia": dia_grade_id},
        )
        return result.scalar_one()
