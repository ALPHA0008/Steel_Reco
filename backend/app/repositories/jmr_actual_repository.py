import uuid
from decimal import Decimal

from sqlalchemy import text

from app.models.transactions import JmrActual
from app.repositories.base import BaseRepository

# A row is "active" when no later row supersedes it. Corrections form a chain
# (A<-B<-C): every superseded link is excluded, only the chain's leaf counts.
# This same predicate guards Abstract section E (abstract_repository) -- if it
# changes here it must change there too, or corrected quantities double-count.
_NOT_SUPERSEDED = (
    "NOT EXISTS (SELECT 1 FROM jmr_actual j2 WHERE j2.corrected_from_id = jmr_actual.id)"
)


class JmrActualRepository(BaseRepository[JmrActual]):
    model = JmrActual

    async def sum_measured_weight_kg(
        self,
        element_id: uuid.UUID,
        dia_grade_id: uuid.UUID,
        exclude_id: uuid.UUID | None = None,
    ) -> Decimal:
        """Sum of every ACTIVE JMR already recorded for this element+dia --
        jmr_exceeds_bbs_plan adds the incoming payload's own weight on top and
        compares the cumulative total to the BBS plan (same shape as
        GrnRepository.cumulative_accepted_kg).

        exclude_id: the row the incoming entry corrects. At evaluation time the
        correction isn't inserted yet, so the original it replaces is still
        "active" here -- without excluding it, a 10->12 correction would
        evaluate as cumulative 22 against the plan.
        """
        sql = (
            "SELECT COALESCE(SUM(measured_weight_kg), 0) AS total "
            "FROM jmr_actual WHERE element_id = :element_id AND dia_grade_id = :dia "
            f"AND {_NOT_SUPERSEDED}"
        )
        params: dict = {"element_id": element_id, "dia": dia_grade_id}
        if exclude_id is not None:
            sql += " AND id != :exclude_id"
            params["exclude_id"] = exclude_id
        result = await self.session.execute(text(sql), params)
        return result.scalar_one()

    async def count_for_element(self, element_id: uuid.UUID) -> int:
        """How many ACTIVE JMR rows already exist for this element, across every
        dia -- duplicate_pour_entry's basis for 'this pour was already recorded.'
        Superseded rows don't count: after correcting A with B, the element has
        one recorded measurement, not two."""
        result = await self.session.execute(
            text(
                "SELECT COUNT(*) AS total FROM jmr_actual "
                f"WHERE element_id = :element_id AND {_NOT_SUPERSEDED}"
            ),
            {"element_id": element_id},
        )
        return result.scalar_one()

    async def superseded_by(self, row_id: uuid.UUID) -> uuid.UUID | None:
        """The id of the row correcting row_id, if any -- guards against
        correction forks (two rows both re-stating the same original)."""
        result = await self.session.execute(
            text("SELECT id FROM jmr_actual WHERE corrected_from_id = :row_id"),
            {"row_id": row_id},
        )
        return result.scalar_one_or_none()
