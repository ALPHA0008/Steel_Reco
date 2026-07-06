import uuid
from decimal import Decimal

from sqlalchemy import text

from app.models.transactions import Grn
from app.repositories.base import BaseRepository


class GrnRepository(BaseRepository[Grn]):
    model = Grn

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
