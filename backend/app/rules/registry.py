from app.rules.engine import RulesEngine
from app.rules.transactional.inbound_reconciliation import InboundReconciliationRule
from app.rules.transactional.issue_exceeds_stock import IssueExceedsStockRule


def build_rules_engine() -> RulesEngine:
    """Single composition root (plan §5.2) -- instantiates and registers every
    rule at app startup. Adding a rule is: write the class, register() it here.
    """
    engine = RulesEngine()
    engine.register(IssueExceedsStockRule())
    engine.register(InboundReconciliationRule())
    return engine


rules_engine = build_rules_engine()
