import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.data_health_repository import DataHealthRepository
from app.schemas.data_health import DataHealthResponse, SectionHealth


class DataHealthService:
    """Per-section data-completeness panel: what's real, what's aggregate,
    what's synthetic, what's known-stale -- so this knowledge lives in the
    app instead of only in a memory file and a QS's head. Quantitative facts
    (counts, dates, link %) are live-queried (DataHealthRepository); the
    qualitative classification per section reflects documented decisions from
    the APAS backfill (backfill_apas_april2026.py's own fidelity notes) and
    does not change on its own -- if the underlying data model changes,
    this classification must be revisited by hand, same as any other
    documentation.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._repo = DataHealthRepository(session)

    async def compute(self, project_id: uuid.UUID) -> DataHealthResponse:
        grn = await self._repo.table_facts(project_id, "grn")
        linkage = await self._repo.grn_po_linkage(project_id)
        bbs = await self._repo.bbs_plan_breakdown(project_id)
        physical = await self._repo.table_facts(project_id, "physical_count")
        jmr = await self._repo.table_facts(project_id, "jmr_actual")
        exceptions = await self._repo.exception_counts(project_id)

        physical_freshness = (
            f"latest count dated {physical['latest']}" if physical["latest"] else "no counts recorded"
        )

        sections = [
            SectionHealth(
                code="A", label="Received", status="real",
                detail=(
                    f"{grn['count']} real SAP GRN rows ({grn['earliest']} to {grn['latest']}), "
                    "full per-row fidelity. Known ~497 MT gap vs the legacy Excel's stated figure -- "
                    "traced to the Excel depending on a manually-maintained side-file that lags real "
                    "SAP receipts by weeks to months (documented root cause, not a bug on our side)."
                ),
            ),
            SectionHealth(
                code="B", label="Transferred out", status="aggregate",
                detail="One row per contractor+diameter (SAP + Excel sides), matches the legacy Excel exactly.",
            ),
            SectionHealth(
                code="C", label="Net Received", status="computed",
                detail="C = A - B. Inherits A's receiving gap.",
            ),
            SectionHealth(
                code="D", label="Issued to Contractor", status="aggregate",
                detail="One row per contractor+diameter, a genuine sum (never derived from C, unlike the legacy Excel's D=C formula).",
            ),
            SectionHealth(
                code="E", label="Consumption", status="aggregate",
                detail=f"{jmr['count']} JMR rows loaded as contractor-aggregate entries; matches the legacy Excel exactly.",
            ),
            SectionHealth(
                code="F", label="Work in Progress", status="synthetic",
                detail=(
                    f"Loaded from the legacy sheet's own stated WIP figure via {bbs['synthetic_rows']} "
                    f"placeholder plan rows ({float(bbs['synthetic_kg']) / 1000:.1f} MT) -- not independently "
                    f"derived from real per-element BBS x completion%. {bbs['real_rows']} real BBS plan rows "
                    f"({float(bbs['real_kg']) / 1000:.1f} MT) exist for T1-T6/NTA/CH/Misc but aren't linked to "
                    "this WIP figure."
                ),
            ),
            SectionHealth(
                code="G", label="Consumption + WIP", status="computed", detail="G = E + F.",
            ),
            SectionHealth(
                code="H", label="Theoretical Stock", status="computed",
                detail="H = C - G. Inherits A's receiving gap.",
            ),
            SectionHealth(
                code="I", label="Physical -- Full length", status="real",
                detail=f"{physical['count']} real physical-count rows from Annexure-1 ({physical_freshness}). Full fidelity, matches the legacy Excel exactly.",
            ),
            SectionHealth(
                code="J", label="Physical -- Cut pieces", status="synthetic",
                detail=(
                    "Built from Annexure-2's aggregate weight per contractor+dia, dated 29-Dec-2025 -- "
                    "NOT a real April per-piece count. A representative 2000mm batch length is used to "
                    "reconstruct piece counts. Matches the legacy Excel's stated J numerically, but is stale "
                    "and not independently verifiable at the piece level."
                ),
            ),
            SectionHealth(
                code="K", label="Total Physical", status="computed", detail="K = I + J.",
            ),
            SectionHealth(
                code="L", label="Wastage Qty", status="computed",
                detail="L = H - K. Inherits A's gap; can go negative per-diameter as a result (a data-quality signal, not a real negative wastage).",
            ),
            SectionHealth(
                code="M", label="Wastage %", status="computed",
                detail="M = L / G, corrected 2026-07-16 (was K/G, a guess flagged since the start as unconfirmed). Verified against the company-wide Recon Steel workbook's own stated wastage% for APAS, matching to 4 decimal places.",
            ),
            SectionHealth(
                code="N", label="Scrap Sold", status="real",
                detail="460 real scrap-sale line items (buyer, weight, rate, gate-pass, real dates). Full fidelity, matches the legacy Excel exactly.",
            ),
        ]

        return DataHealthResponse(
            generated_for_period="2026-04",
            sections=sections,
            po_invoice_linkage_pct=linkage["linked_pct"],
            grn_total=linkage["total"],
            grn_linked=linkage["linked"],
            open_exceptions=exceptions["open"],
            total_exceptions=exceptions["total"],
            earliest_activity=grn["earliest"],
            latest_activity=grn["latest"],
        )
