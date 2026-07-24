import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import text

from app.models.transactions import MyHomeStock
from app.repositories.base import BaseRepository


class MyHomeStockRepository(BaseRepository[MyHomeStock]):
    model = MyHomeStock

    async def latest_by_dia(self, project_id: uuid.UUID, month_end: date) -> dict[str, Decimal]:
        """Abstract's MyHome bucket: the LATEST snapshot per dia up to
        month_end, never summed -- same "latest, not summed" rule as
        physical_count sections I/J (plan §4)."""
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
