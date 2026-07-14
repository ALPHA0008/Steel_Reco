from app.rules.engine import RulesEngine
from app.rules.transactional.duplicate_pour_entry import DuplicatePourEntryRule
from app.rules.transactional.inbound_reconciliation import InboundReconciliationRule
from app.rules.transactional.issue_exceeds_stock import IssueExceedsStockRule
from app.rules.transactional.jmr_exceeds_bbs_plan import JmrExceedsBbsPlanRule


def build_rules_engine() -> RulesEngine:
    """Single composition root (plan §5.2) -- instantiates and registers every
    rule at app startup. Adding a rule is: write the class, register() it here.
    """
    engine = RulesEngine()
    engine.register(IssueExceedsStockRule())
    engine.register(InboundReconciliationRule())
    engine.register(JmrExceedsBbsPlanRule())
    engine.register(DuplicatePourEntryRule())
    return engine


rules_engine = build_rules_engine()
