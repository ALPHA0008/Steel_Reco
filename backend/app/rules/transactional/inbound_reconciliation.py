from decimal import Decimal

from app.rules.base import BaseRule, RuleContext, RuleMode, RuleResult

# A GRN with neither PO nor invoice linked isn't a violation of a threshold --
# it's simply unreconciled. Tolerance below is for the case where BOTH exist:
# how far the weighbridge net may drift from the invoiced/PO qty before it's
# flagged (plan §3.5's inbound-reconciliation check).
DEFAULT_TOLERANCE_PCT = Decimal("2.0")


class InboundReconciliationRule(BaseRule):
    """Validates a GRN against its Tier-1 anchors (plan §3.5, the 2026-07
    process reframing): invoiced_qty vs (gross-tare) vs weighbridge net, and
    Sigma(GRN accepted) vs the PO line's ordered_qty_kg.

    Advisory-first, like issue_exceeds_stock -- a site's documents are often
    incomplete (no PO, no invoice yet), and that incompleteness is itself the
    finding this rule surfaces, not a reason to block the GRN (plan §0.5).
    ctx.derived is pre-fetched by GrnService inside the same transaction as
    the insert, keeping this rule pure and unit-testable with plain dicts.
    """

    rule_id = "inbound_reconciliation"
    applies_to = "grn"
    default_mode = RuleMode.ADVISORY

    async def evaluate(self, ctx: RuleContext) -> RuleResult:
        mode = RuleMode(ctx.thresholds.get("mode", self.default_mode.value))
        tolerance_pct = Decimal(str(ctx.thresholds.get("tolerance_pct", DEFAULT_TOLERANCE_PCT)))

        weighbridge_net = ctx.payload.get("weighbridge_weight_kg")
        gross = ctx.derived.get("gross_weight_kg")
        tare = ctx.derived.get("tare_weight_kg")
        invoiced_qty = ctx.derived.get("invoiced_qty_kg")
        po_id = ctx.derived.get("po_id")
        ordered_qty = ctx.derived.get("ordered_qty_kg")
        cumulative_accepted = ctx.derived.get("cumulative_accepted_kg")

        reasons: list[str] = []

        # 1. weighbridge net vs (gross - tare), when both slip weights are recorded
        if gross is not None and tare is not None:
            slip_net = gross - tare
            if slip_net > 0:
                drift_pct = abs(weighbridge_net - slip_net) / slip_net * 100
                if drift_pct > tolerance_pct:
                    reasons.append(
                        f"weighbridge net ({weighbridge_net}kg) differs from gross-tare "
                        f"({slip_net}kg) by {drift_pct:.1f}%, over the {tolerance_pct}% tolerance"
                    )

        # 2. invoiced qty vs accepted net, when an invoice is linked
        if invoiced_qty is not None and invoiced_qty > 0:
            drift_pct = abs(weighbridge_net - invoiced_qty) / invoiced_qty * 100
            if drift_pct > tolerance_pct:
                reasons.append(
                    f"accepted net ({weighbridge_net}kg) differs from the invoiced "
                    f"quantity ({invoiced_qty}kg) by {drift_pct:.1f}%"
                )

        # 3. PO discipline: cumulative accepted (including this GRN) vs ordered qty
        if po_id is not None and ordered_qty is not None and cumulative_accepted is not None:
            if cumulative_accepted > ordered_qty:
                reasons.append(
                    f"cumulative receipts against this PO+diameter ({cumulative_accepted}kg) "
                    f"exceed the ordered quantity ({ordered_qty}kg)"
                )

        # 4. no anchor at all -- unreconciled, not necessarily wrong
        if po_id is None and invoiced_qty is None:
            reasons.append("no Purchase Order or Supplier Invoice linked -- unreconciled")

        passed = len(reasons) == 0
        return RuleResult(
            rule_id=self.rule_id,
            passed=passed,
            mode=mode,
            threshold=tolerance_pct,
            actual_value=weighbridge_net,
            message="; ".join(reasons),
        )
