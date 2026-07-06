import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Any


class RuleMode(str, Enum):
    ADVISORY = "advisory"  # writes exception_log, does NOT block the write
    BLOCKING = "blocking"  # rejects the write at the API layer


@dataclass
class RuleContext:
    """Everything a rule needs, pre-fetched so rules stay pure and unit-testable
    with plain dicts (plan §5.2) -- no DB session, no framework coupling.
    """

    project_id: uuid.UUID
    transaction_type: str  # "store_issue", "physical_count", ...
    transaction_id: uuid.UUID | None  # None for pre-insert checks
    payload: dict[str, Any]
    derived: dict[str, Any] = field(default_factory=dict)  # e.g. {"available_qty": Decimal("12.5")}
    thresholds: dict[str, Any] = field(default_factory=dict)


@dataclass
class RuleResult:
    rule_id: str
    passed: bool
    mode: RuleMode
    threshold: Decimal | str | None = None
    actual_value: Decimal | str | None = None
    message: str = ""

    def to_exception_log_kwargs(self, ctx: RuleContext) -> dict[str, Any]:
        """A failed RuleResult IS the exception_log row (plan §5.2)."""
        return {
            "project_id": ctx.project_id,
            "rule_name": self.rule_id,
            "severity": self.mode.value,
            "transaction_table": ctx.transaction_type,
            "transaction_id": ctx.transaction_id,
            "threshold_value": self.threshold,
            "actual_value": self.actual_value,
            "message": self.message,
        }


class BaseRule(ABC):
    rule_id: str
    applies_to: str  # transaction_type this rule fires on (plan §5.2 dispatch)
    default_mode: RuleMode

    @abstractmethod
    async def evaluate(self, ctx: RuleContext) -> RuleResult: ...
