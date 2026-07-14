import uuid
from decimal import Decimal

import pytest

from app.rules.base import RuleContext, RuleMode
from app.rules.transactional.jmr_exceeds_bbs_plan import JmrExceedsBbsPlanRule


def _ctx(
    *,
    element_id: uuid.UUID | None,
    planned: Decimal | None,
    cumulative_actual: Decimal | None,
    mode: str = "advisory",
    tolerance_pct: Decimal | None = None,
) -> RuleContext:
    own_thresholds: dict = {"mode": mode}
    if tolerance_pct is not None:
        own_thresholds["tolerance_pct"] = tolerance_pct
    derived: dict = {}
    if planned is not None:
        derived["bbs_planned_weight_kg"] = planned
    if cumulative_actual is not None:
        derived["cumulative_measured_weight_kg"] = cumulative_actual
    return RuleContext(
        project_id=uuid.uuid4(),
        transaction_type="jmr_actual",
        transaction_id=None,
        payload={"element_id": element_id},
        derived=derived,
        thresholds={"jmr_exceeds_bbs_plan": own_thresholds},
    )


@pytest.mark.asyncio
async def test_passes_when_no_element_linked():
    rule = JmrExceedsBbsPlanRule()
    result = await rule.evaluate(_ctx(element_id=None, planned=None, cumulative_actual=None))
    assert result.passed is True


@pytest.mark.asyncio
async def test_fails_advisory_when_no_bbs_plan_found():
    rule = JmrExceedsBbsPlanRule()
    result = await rule.evaluate(
        _ctx(element_id=uuid.uuid4(), planned=Decimal("0"), cumulative_actual=Decimal("50"))
    )
    assert result.passed is False
    assert result.mode == RuleMode.ADVISORY
    assert "no BBS plan found" in result.message


@pytest.mark.asyncio
async def test_passes_within_tolerance():
    rule = JmrExceedsBbsPlanRule()
    result = await rule.evaluate(
        _ctx(element_id=uuid.uuid4(), planned=Decimal("100"), cumulative_actual=Decimal("108"))
    )
    assert result.passed is True


@pytest.mark.asyncio
async def test_fails_beyond_default_tolerance():
    rule = JmrExceedsBbsPlanRule()
    result = await rule.evaluate(
        _ctx(element_id=uuid.uuid4(), planned=Decimal("100"), cumulative_actual=Decimal("115"))
    )
    assert result.passed is False
    assert "exceeds the BBS-planned quantity" in result.message


@pytest.mark.asyncio
async def test_passes_at_exact_tolerance_boundary():
    rule = JmrExceedsBbsPlanRule()
    result = await rule.evaluate(
        _ctx(element_id=uuid.uuid4(), planned=Decimal("100"), cumulative_actual=Decimal("110"))
    )
    assert result.passed is True


@pytest.mark.asyncio
async def test_respects_project_level_tolerance_override():
    rule = JmrExceedsBbsPlanRule()
    result = await rule.evaluate(
        _ctx(
            element_id=uuid.uuid4(),
            planned=Decimal("100"),
            cumulative_actual=Decimal("115"),
            tolerance_pct=Decimal("20"),
        )
    )
    assert result.passed is True


@pytest.mark.asyncio
async def test_fails_blocking_when_mode_is_blocking():
    rule = JmrExceedsBbsPlanRule()
    result = await rule.evaluate(
        _ctx(element_id=uuid.uuid4(), planned=Decimal("100"), cumulative_actual=Decimal("115"), mode="blocking")
    )
    assert result.passed is False
    assert result.mode == RuleMode.BLOCKING
