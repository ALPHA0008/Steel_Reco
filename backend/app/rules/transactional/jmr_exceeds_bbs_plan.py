from decimal import Decimal

from app.rules.base import BaseRule, RuleContext, RuleMode, RuleResult

# How far cumulative JMR-measured weight for one element+dia may exceed that
# element's BBS-planned weight before it's flagged. Confirmed with the
# project owner: legitimate variance (wastage, minor design revisions)
# happens, so this stays advisory rather than blocking (plan §5.3 pattern).
DEFAULT_TOLERANCE_PCT = Decimal("10.0")


class JmrExceedsBbsPlanRule(BaseRule):
    """Validates JMR-measured steel against its BBS plan -- the ground-truth
    ceiling for a tower/floor/element/dia (the 2026-07 manipulation-catching
    reframing). ctx.derived is pre-fetched by JmrActualService inside the
    same transaction as the insert: bbs_planned_weight_kg (SUM across every
    bar-mark row for this element+dia) and cumulative_measured_weight_kg
    (every prior JMR for this element+dia, PLUS this entry's own weight).

    An element with no BBS plan row at all isn't a violation of a threshold
    -- it's simply unreconciled, same as inbound_reconciliation's 'no PO or
    invoice linked' case. A JmrActual with no element_id (some historical/
    coarse-grained entries won't have one) can't be checked at all and
    passes silently.
    """

    rule_id = "jmr_exceeds_bbs_plan"
    applies_to = "jmr_actual"
    default_mode = RuleMode.ADVISORY

    async def evaluate(self, ctx: RuleContext) -> RuleResult:
        # jmr_actual runs two rules against the same ctx, so thresholds are
        # keyed by rule_id rather than the flat {"mode": ...} shape single-rule
        # transaction types (store_issue, grn) use -- a flat key here would let
        # this rule's mode override leak into duplicate_pour_entry's lookup.
        own_thresholds = ctx.thresholds.get(self.rule_id, {})
        mode = RuleMode(own_thresholds.get("mode", self.default_mode.value))
        tolerance_pct = Decimal(str(own_thresholds.get("tolerance_pct", DEFAULT_TOLERANCE_PCT)))

        element_id = ctx.payload.get("element_id")
        planned = ctx.derived.get("bbs_planned_weight_kg")
        cumulative_actual = ctx.derived.get("cumulative_measured_weight_kg")

        reasons: list[str] = []
        if element_id is not None:
            if planned is None or planned == 0:
                reasons.append("no BBS plan found for this element/diameter -- unreconciled")
            else:
                allowed_max = planned * (1 + tolerance_pct / 100)
                if cumulative_actual > allowed_max:
                    drift_pct = (cumulative_actual - planned) / planned * 100
                    reasons.append(
                        f"cumulative JMR-measured weight ({cumulative_actual}kg) exceeds the "
                        f"BBS-planned quantity ({planned}kg) for this element by {drift_pct:.1f}%, "
                        f"over the {tolerance_pct}% tolerance"
                    )

        passed = len(reasons) == 0
        return RuleResult(
            rule_id=self.rule_id,
            passed=passed,
            mode=mode,
            threshold=planned,
            actual_value=cumulative_actual,
            message="; ".join(reasons),
        )
