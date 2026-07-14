import uuid
from decimal import Decimal

from sqlalchemy import text

from app.models.transactions import BbsPlan
from app.repositories.base import BaseRepository


class BbsPlanRepository(BaseRepository[BbsPlan]):
    model = BbsPlan

    async def sum_planned_weight_kg(self, element_id: uuid.UUID, dia_grade_id: uuid.UUID) -> Decimal:
        """Sum planned_weight_kg across every bar-mark row for one element+dia --
        the ground-truth ceiling that jmr_exceeds_bbs_plan checks actual JMR
        entries against (a pour's plan is usually several bar-mark rows, not one).
        """
        result = await self.session.execute(
            text(
                "SELECT COALESCE(SUM(planned_weight_kg), 0) AS total "
                "FROM bbs_plan WHERE element_id = :element_id AND dia_grade_id = :dia"
            ),
            {"element_id": element_id, "dia": dia_grade_id},
        )
        return result.scalar_one()
