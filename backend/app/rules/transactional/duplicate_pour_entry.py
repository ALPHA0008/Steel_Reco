from decimal import Decimal

from app.rules.base import BaseRule, RuleContext, RuleMode, RuleResult


class DuplicatePourEntryRule(BaseRule):
    """One physical pour (a tower/floor/element) should have exactly one JMR
    record per casting -- a second entry against the same element is either a
    genuine re-measurement/correction (in which case the payload links
    corrected_from_id back to the original) or an accidental duplicate.

    ctx.derived["existing_jmr_count_for_element"] is pre-fetched by
    JmrActualService inside the same transaction as the insert -- how many
    JMR rows (across every dia) already reference this element. An element
    with no element_id linked (some historical/coarse-grained entries won't
    have one) can't be checked for duplication and passes silently.
    """

    rule_id = "duplicate_pour_entry"
    applies_to = "jmr_actual"
    default_mode = RuleMode.ADVISORY

    async def evaluate(self, ctx: RuleContext) -> RuleResult:
        # keyed by rule_id, not a flat {"mode": ...} -- see jmr_exceeds_bbs_plan
        # for why jmr_actual's two rules can't share one flat thresholds dict.
        own_thresholds = ctx.thresholds.get(self.rule_id, {})
        mode = RuleMode(own_thresholds.get("mode", self.default_mode.value))

        element_id = ctx.payload.get("element_id")
        is_correction = ctx.payload.get("corrected_from_id") is not None
        existing_count = ctx.derived.get("existing_jmr_count_for_element", 0)

        passed = element_id is None or is_correction or existing_count == 0
        plural = "y" if existing_count == 1 else "ies"
        return RuleResult(
            rule_id=self.rule_id,
            passed=passed,
            mode=mode,
            threshold=Decimal("0"),
            actual_value=Decimal(str(existing_count)),
            message=(
                ""
                if passed
                else f"This element already has {existing_count} recorded JMR entr{plural} -- "
                "confirm this is a new pour, not a duplicate measurement"
            ),
        )
