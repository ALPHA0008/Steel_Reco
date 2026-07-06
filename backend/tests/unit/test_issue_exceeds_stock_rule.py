import uuid
from decimal import Decimal

import pytest

from app.rules.base import RuleContext, RuleMode
from app.rules.transactional.issue_exceeds_stock import IssueExceedsStockRule


def _ctx(*, requested: Decimal, available: Decimal, mode: str = "advisory") -> RuleContext:
    return RuleContext(
        project_id=uuid.uuid4(),
        transaction_type="store_issue",
        transaction_id=None,
        payload={"quantity_kg": requested},
        derived={"available_qty": available},
        thresholds={"mode": mode},
    )


@pytest.mark.asyncio
async def test_passes_when_within_stock():
    rule = IssueExceedsStockRule()
    result = await rule.evaluate(_ctx(requested=Decimal("5"), available=Decimal("10")))
    assert result.passed is True
    assert result.rule_id == "issue_exceeds_stock"


@pytest.mark.asyncio
async def test_fails_advisory_when_exceeding_stock():
    rule = IssueExceedsStockRule()
    result = await rule.evaluate(_ctx(requested=Decimal("15"), available=Decimal("10"), mode="advisory"))
    assert result.passed is False
    assert result.mode == RuleMode.ADVISORY
    assert "exceeds available stock" in result.message


@pytest.mark.asyncio
async def test_fails_blocking_when_mode_is_blocking():
    rule = IssueExceedsStockRule()
    result = await rule.evaluate(_ctx(requested=Decimal("15"), available=Decimal("10"), mode="blocking"))
    assert result.passed is False
    assert result.mode == RuleMode.BLOCKING


@pytest.mark.asyncio
async def test_passes_at_exact_boundary():
    """requested == available should pass (issue > stock is the violation, not >=)."""
    rule = IssueExceedsStockRule()
    result = await rule.evaluate(_ctx(requested=Decimal("10"), available=Decimal("10")))
    assert result.passed is True
