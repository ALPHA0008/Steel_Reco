from app.rules.base import BaseRule, RuleContext, RuleMode, RuleResult


class RulesEngine:
    """Orchestrator, not rule implementation (plan §5.2). Each BaseRule
    declares applies_to; register() files it under that key; evaluate()
    filters to the rules registered for the context's transaction_type.
    Services stay ignorant of which rules exist -- adding a rule is
    'write the class + register it,' never a service change.
    """

    def __init__(self) -> None:
        self._rules: dict[str, list[BaseRule]] = {}

    def register(self, rule: BaseRule) -> None:
        self._rules.setdefault(rule.applies_to, []).append(rule)

    async def evaluate(self, ctx: RuleContext) -> list[RuleResult]:
        results = []
        for rule in self._rules.get(ctx.transaction_type, []):
            results.append(await rule.evaluate(ctx))
        return results

    @staticmethod
    def blocking_failures(results: list[RuleResult]) -> list[RuleResult]:
        return [r for r in results if not r.passed and r.mode == RuleMode.BLOCKING]

    @staticmethod
    def advisory_failures(results: list[RuleResult]) -> list[RuleResult]:
        return [r for r in results if not r.passed and r.mode == RuleMode.ADVISORY]
