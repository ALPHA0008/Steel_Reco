from app.rules.base import BaseRule, RuleContext, RuleMode, RuleResult


class TransferExceedsStockRule(BaseRule):
    """A loan-out inter-site transfer draws on the same store-wide pool as a
    store issue -- you cannot lend another site steel this site never received.
    Before this rule the transfer path did NO stock check at all, so a transfer
    out could silently drive available stock negative (and, since Section B
    feeds the D>C reconciliation, quietly manufacture the exact impossible
    "issued more than received" shape the app exists to catch).

    Same posture as issue_exceeds_stock: ADVISORY by default (inter-site
    movement is genuinely under-recorded in the legacy data, so a hard block
    would reject real history), promotable to BLOCKING via a rule_thresholds
    row with no deploy. Only 'loan' (outbound) transfers are checked -- a
    'return' inbound adds to the pool, it never draws it down. The service
    pre-fetches available_qty inside the advisory lock; this rule does no I/O.
    """

    rule_id = "transfer_exceeds_stock"
    applies_to = "inter_site_transfer"
    default_mode = RuleMode.ADVISORY

    async def evaluate(self, ctx: RuleContext) -> RuleResult:
        # a 'return' inbound isn't a draw-down -- nothing to check, always passes
        if ctx.payload.get("flag") != "loan":
            return RuleResult(
                rule_id=self.rule_id, passed=True, mode=self.default_mode,
                threshold=None, actual_value=None, message="",
            )

        available = ctx.derived["available_qty"]
        requested = ctx.payload["quantity_kg"]
        mode = RuleMode(ctx.thresholds.get(self.rule_id, {}).get("mode", self.default_mode.value))

        passed = requested <= available
        # See issue_exceeds_stock: an overdrawn balance is reported as a
        # shortfall rather than a negative "available" figure.
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
                ""
                if passed
                else f"Transfer out of {requested}kg exceeds stock for this diameter — "
                f"{stock_phrase}; lending steel this site never received"
            ),
        )
