import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system import ExceptionLog
from app.repositories.stock_repository import StockRepository
from app.rules.base import RuleContext
from app.rules.registry import rules_engine


@dataclass
class RevalidationOutcome:
    """The answer to "is this actually fixed now?".

    `checkable` is the honest part: not every rule can be re-derived from the
    ledger after the fact, and pretending otherwise would be worse than saying
    so. When it's False the caller must NOT treat the claim as verified -- it
    falls back to an explicit, audited acceptance instead.
    """

    checkable: bool
    passed: bool
    detail: str


class ExceptionRevalidationService:
    """Re-runs the SAME rule that produced an exception, against data as it
    stands now, so a "corrected" claim is proven rather than believed.

    Rules are pure functions over a pre-fetched RuleContext (plan §5.2), so
    re-checking means rebuilding that context from current rows and handing it
    back to the engine -- never a re-implementation of the rule's logic, which
    could drift and silently pass something the engine would fail. For the same
    reason the stock figure comes from StockRepository.available_qty (the one
    canonical formula), not a hand-written copy of it.
    """

    def __init__(self, session: AsyncSession, project_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._engine = rules_engine
        self._stock = StockRepository(session)

    async def revalidate(self, row: ExceptionLog) -> RevalidationOutcome:
        builder = {
            "issue_exceeds_stock": self._ctx_issue_exceeds_stock,
            "transfer_exceeds_stock": self._ctx_transfer_exceeds_stock,
        }.get(row.rule_name)

        if builder is None:
            return RevalidationOutcome(
                checkable=False,
                passed=False,
                detail=(
                    f"'{row.rule_name}' depends on values captured at entry time, so it cannot be "
                    "re-derived from the ledger afterwards. This correction needs an explicit "
                    "sign-off rather than an automatic re-check."
                ),
            )

        ctx = await builder(row)
        if ctx is None:
            return RevalidationOutcome(
                checkable=False,
                passed=False,
                detail=(
                    "The transaction this exception points at no longer exists, so the original "
                    "check cannot be re-run against it."
                ),
            )

        # Let the engine run its registered rules and pick out the one that
        # fired, so this never re-implements rule logic.
        results = await self._engine.evaluate(ctx)
        result = next((r for r in results if r.rule_id == row.rule_name), None)
        if result is None:
            return RevalidationOutcome(
                checkable=False, passed=False, detail=f"rule '{row.rule_name}' is no longer registered"
            )

        if result.passed:
            return RevalidationOutcome(
                checkable=True,
                passed=True,
                detail="Re-ran the original check against current data: it now passes.",
            )
        # rstrip + explicit '.' so the rule's own message runs into the advice
        # as a sentence, whether or not that message ends in punctuation.
        finding = result.message.rstrip().rstrip(".")
        return RevalidationOutcome(
            checkable=True,
            passed=False,
            detail=(
                f"Re-ran the original check against current data and it STILL fails: {finding}. "
                "Correct the underlying record, or approve it as-is with a reason."
            ),
        )

    # ---- per-rule context rebuilds -------------------------------------------
    # Each mirrors what the owning service pre-fetches at write time, but reads
    # CURRENT state so the rule judges today's data, not the entry snapshot.
    #
    # Both add the row's own quantity back to available stock: available_qty
    # already nets this transaction out, so without that the row is counted
    # against itself and the check could never pass even after a real fix.

    async def _ctx_issue_exceeds_stock(self, row: ExceptionLog) -> RuleContext | None:
        issue = (
            (
                await self._session.execute(
                    text(
                        "SELECT id, dia_grade_id, quantity_kg, direction FROM store_issue "
                        "WHERE id = :id AND project_id = :pid"
                    ),
                    {"id": row.transaction_id, "pid": self._project_id},
                )
            )
            .mappings()
            .first()
        )
        if issue is None:
            return None

        available = await self._stock.available_qty(self._project_id, issue["dia_grade_id"])
        if issue["direction"] == "out":
            available += Decimal(issue["quantity_kg"])

        return RuleContext(
            project_id=self._project_id,
            transaction_type="store_issue",
            transaction_id=issue["id"],
            payload={"quantity_kg": issue["quantity_kg"]},
            derived={"available_qty": available},
        )

    async def _ctx_transfer_exceeds_stock(self, row: ExceptionLog) -> RuleContext | None:
        tr = (
            (
                await self._session.execute(
                    text(
                        "SELECT id, dia_grade_id, quantity_kg, flag FROM inter_site_transfer "
                        "WHERE id = :id AND project_id = :pid"
                    ),
                    {"id": row.transaction_id, "pid": self._project_id},
                )
            )
            .mappings()
            .first()
        )
        if tr is None:
            return None

        available = await self._stock.available_qty(self._project_id, tr["dia_grade_id"])
        if tr["flag"] == "loan":
            available += Decimal(tr["quantity_kg"])

        return RuleContext(
            project_id=self._project_id,
            transaction_type="inter_site_transfer",
            transaction_id=tr["id"],
            payload={"quantity_kg": tr["quantity_kg"], "flag": tr["flag"]},
            derived={"available_qty": available},
        )
