import uuid
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import selectinload

from app.models.transactions import PhysicalCount, PhysicalCountCutPiece
from app.repositories.base import BaseRepository


class PhysicalCountRepository(BaseRepository[PhysicalCount]):
    model = PhysicalCount
    # Required so PhysicalCountResponse.model_validate(...).cut_pieces doesn't
    # trigger an async lazy-load (MissingGreenlet, caught live on the first
    # GET /physical-counts after a fresh session).
    eager_options = (selectinload(PhysicalCount.cut_pieces),)

    async def add_with_cut_pieces(
        self, instance: PhysicalCount, cut_pieces: list[dict]
    ) -> PhysicalCount:
        """Inserts the physical_count row and its cut_pieces children in one
        flush. The scrap_rule / classification CHECK constraints (plan §3.2)
        are the real enforcement -- this method just wires the FK correctly.

        Cut pieces are assigned to the relationship as a whole list -- even
        when empty -- rather than appended one at a time. Appending to an
        untouched `instance.cut_pieces` when `cut_pieces` is empty means the
        for-loop body never runs, so the collection is never accessed and
        stays in an "unknown" state; reading it back later (e.g. to build
        the API response) then triggers exactly the async lazy-load crash
        `eager_options` fixes for reads (MissingGreenlet) -- caught live via
        `POST .../physical-counts` with `"cut_pieces": []`. Assigning the
        full list explicitly initializes the collection as loaded, with zero
        items, so no later access needs a DB round-trip.
        """
        if self.project_id is not None:
            instance.project_id = self.project_id
        instance.cut_pieces = [
            PhysicalCountCutPiece(
                project_id=instance.project_id,
                length_mm=cp["length_mm"],
                nos=cp["nos"],
                weight_kg=cp["weight_kg"],
                classification=cp["classification"],
            )
            for cp in cut_pieces
        ]
        self.session.add(instance)
        await self.session.flush()
        return instance

    async def latest_closing_stock(
        self, project_id: uuid.UUID, month_end: str
    ) -> list[dict]:
        """Abstract sections I/J (plan §4): physical stock is the LATEST count
        per contractor+dia up to month_end, not a sum. Uses the
        {project_id, contractor_id, dia_grade_id, effective_date DESC} index.
        """
        result = await self.session.execute(
            text(
                """
                WITH latest AS (
                    SELECT DISTINCT ON (contractor_id, dia_grade_id) *
                    FROM physical_count
                    WHERE project_id = :pid AND effective_date <= :month_end
                    ORDER BY contractor_id, dia_grade_id, effective_date DESC
                )
                SELECT
                    l.id, l.contractor_id, l.dia_grade_id,
                    COALESCE(l.bundle_count, 0) * COALESCE(l.each_bundle_weight_kg, 0)
                      + COALESCE(l.loose_rod_count, 0) * COALESCE(l.each_rod_weight_kg, 0)
                      AS full_length_kg
                FROM latest l
                """
            ),
            {"pid": project_id, "month_end": month_end},
        )
        rows = [dict(r._mapping) for r in result.fetchall()]

        # cut pieces for those same latest counts, split by classification
        if rows:
            count_ids = [r["id"] for r in rows]
            cp_result = await self.session.execute(
                text(
                    """
                    SELECT physical_count_id, classification,
                           SUM(nos * weight_kg) AS total_kg
                    FROM physical_count_cut_piece
                    WHERE physical_count_id = ANY(:ids)
                    GROUP BY physical_count_id, classification
                    """
                ),
                {"ids": count_ids},
            )
            cut_piece_totals: dict[uuid.UUID, dict[str, Decimal]] = {}
            for cp_row in cp_result.fetchall():
                cut_piece_totals.setdefault(cp_row.physical_count_id, {})[cp_row.classification] = (
                    cp_row.total_kg
                )
            for r in rows:
                r["cut_pieces"] = cut_piece_totals.get(r["id"], {})
        else:
            for r in rows:
                r["cut_pieces"] = {}

        return rows
