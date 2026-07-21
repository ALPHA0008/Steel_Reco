import uuid
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class DataHealthRepository:
    """Raw facts backing the data-completeness panel -- live-queried counts,
    date ranges, and linkage percentages so the panel can't silently go stale
    the way a hardcoded status page would. The qualitative judgment (is this
    section real, aggregate, or synthetic) is curated in DataHealthService
    from documented decisions; this repository only supplies numbers.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def table_facts(self, project_id: uuid.UUID, table: str, project_col: str = "project_id") -> dict:
        result = await self.session.execute(
            text(
                f"SELECT COUNT(*) AS n, MIN(effective_date) AS earliest, MAX(effective_date) AS latest "
                f"FROM {table} WHERE {project_col} = :pid"
            ),
            {"pid": project_id},
        )
        row = result.fetchone()
        return {"count": row.n, "earliest": row.earliest, "latest": row.latest}

    async def grn_po_linkage(self, project_id: uuid.UUID) -> dict:
        result = await self.session.execute(
            text(
                "SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE po_id IS NOT NULL) AS linked "
                "FROM grn WHERE project_id = :pid"
            ),
            {"pid": project_id},
        )
        row = result.fetchone()
        pct = float(row.linked) / row.n * 100 if row.n else None
        return {"total": row.n, "linked": row.linked, "linked_pct": pct}

    async def bbs_plan_breakdown(self, project_id: uuid.UUID) -> dict:
        """Real per-tower/BBS-imported plan rows vs the synthetic
        WIP-stated-backfill placeholder rows (source_file marker)."""
        result = await self.session.execute(
            text(
                """
                SELECT
                    COUNT(*) FILTER (WHERE source_file = 'WIP-stated-backfill') AS synthetic_rows,
                    COALESCE(SUM(planned_weight_kg) FILTER (WHERE source_file = 'WIP-stated-backfill'), 0) AS synthetic_kg,
                    COUNT(*) FILTER (WHERE source_file IS DISTINCT FROM 'WIP-stated-backfill') AS real_rows,
                    COALESCE(SUM(planned_weight_kg) FILTER (WHERE source_file IS DISTINCT FROM 'WIP-stated-backfill'), 0) AS real_kg
                FROM bbs_plan WHERE project_id = :pid
                """
            ),
            {"pid": project_id},
        )
        row = result.fetchone()
        return {
            "synthetic_rows": row.synthetic_rows, "synthetic_kg": row.synthetic_kg,
            "real_rows": row.real_rows, "real_kg": row.real_kg,
        }

    async def exception_counts(self, project_id: uuid.UUID) -> dict:
        result = await self.session.execute(
            text(
                "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'open') AS open "
                "FROM exception_log WHERE project_id = :pid"
            ),
            {"pid": project_id},
        )
        row = result.fetchone()
        return {"total": row.total, "open": row.open}

    async def section_a_gap_kg(self, project_id: uuid.UUID) -> Decimal | None:
        """The known, documented Section A receiving gap: SAP-only received
        vs the legacy Excel's stated figure. Not derivable from our own DB
        (the Excel figure lives in a file, not a table) -- returns None;
        the service supplies the documented constant with its provenance."""
        return None
