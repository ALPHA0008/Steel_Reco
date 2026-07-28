from app.rules.base import BaseRule, RuleContext, RuleMode, RuleResult


class IssueExceedsStockRule(BaseRule):
    """The core invariant (PRD §6, plan §5.3). ctx.derived["available_qty"]
    and ctx.payload["quantity_kg"] are pre-fetched by store_issue_service
    inside the same transaction/advisory-lock as the eventual insert -- this
    rule itself does no DB I/O, keeping it pure and unit-testable.

    Mode defaults to ADVISORY (Phase 2 per PRD §6); promoted to BLOCKING via
    a rule_thresholds row once 2 real cycles confirm no false positives
    (plan §5.3) -- no code deploy needed for that flip.
    """

    rule_id = "issue_exceeds_stock"
    applies_to = "store_issue"
    default_mode = RuleMode.ADVISORY

    async def evaluate(self, ctx: RuleContext) -> RuleResult:
        available = ctx.derived["available_qty"]
        requested = ctx.payload["quantity_kg"]
        mode = RuleMode(ctx.thresholds.get("mode", self.default_mode.value))

        passed = requested <= available
        # A negative "available" means the books are already short for this dia
        # (issues on record exceed receipts). Printing "available stock of
        # -8500kg" reads as nonsense to a QS, so an overdrawn balance is stated
        # as the shortfall it actually is.
        if available < 0:
            stock_phrase = f"stock is already short by {-available}kg"
        else:
            stock_phrase = f"available stock is {available}kg"
        return RuleResult(
            rule_id=self.rule_id,
            passed=passed,
            mode=mode,
            threshold=available,
            actual_value=requested,
            message=(
                "" if passed else f"Issue of {requested}kg exceeds stock for this diameter — {stock_phrase}"
            ),
        )
