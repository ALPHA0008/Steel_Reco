import uuid
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class StockRepository:
    """Computes available stock for the issue>stock invariant (plan §5.3).

    Stock is a shared store-wide pool per project -- confirmed directly with
    My Home store management (2026-07): GRN/PO are never raised against a
    specific contractor. So availability is per (project, dia) only, never
    per-contractor. This is NOT a BaseRepository subclass -- it spans three
    tables (grn, store_issue, inter_site_transfer) and has no single model.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def available_qty(self, project_id: uuid.UUID, dia_grade_id: uuid.UUID) -> Decimal:
        """available = store-wide receipts
                      - store-wide issues out + issues returned in
                      - transfers out + transfers in
           (all at the dia grain, no contractor split -- plan §5.3)

        Every SUM ... FILTER is individually COALESCEd, which is load-bearing
        rather than defensive: a FILTER that matches no row yields NULL, and
        `SUM(out) - NULL` is NULL, so an outer COALESCE(..., 0) would collapse
        the whole term to zero. That silently dropped ALL issues from the
        balance whenever a dia had no return row -- overstating available stock
        and under-firing the core issue>stock invariant. Found when the
        exception re-check (which, unlike the write path, reads stock AFTER the
        row exists) reported a violating issue as passing.
        """
        result = await self.session.execute(
            text(
                """
                SELECT
                    COALESCE((SELECT SUM(weighbridge_weight_kg) FROM grn
                              WHERE project_id = :pid AND dia_grade_id = :dia), 0)
                  - (SELECT COALESCE(SUM(quantity_kg) FILTER (WHERE direction='out'), 0)
                          - COALESCE(SUM(quantity_kg) FILTER (WHERE direction='in'), 0)
                     FROM store_issue WHERE project_id = :pid AND dia_grade_id = :dia)
                  - (SELECT COALESCE(SUM(quantity_kg) FILTER (WHERE flag='loan' AND from_project_id = :pid), 0)
                          - COALESCE(SUM(quantity_kg) FILTER (WHERE flag='return' AND to_project_id = :pid), 0)
                     FROM inter_site_transfer WHERE dia_grade_id = :dia)
                  AS available_kg
                """
            ),
            {"pid": project_id, "dia": dia_grade_id},
        )
        return result.scalar_one()

    async def acquire_dia_lock(self, project_id: uuid.UUID, dia_grade_id: uuid.UUID) -> None:
        """Serializes the check-and-insert per (project, dia) so concurrent
        issues of the same dia can't race the stock read (plan §5.3).
        pg_advisory_xact_lock auto-releases at transaction commit/rollback --
        MUST be called inside the same transaction as the eventual insert.
        """
        key = f"{project_id}:{dia_grade_id}"
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": key}
        )
