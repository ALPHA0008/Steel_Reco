import uuid
from decimal import Decimal

import pytest

from app.rules.base import RuleContext, RuleMode
from app.rules.transactional.duplicate_pour_entry import DuplicatePourEntryRule


def _ctx(
    *,
    element_id: uuid.UUID | None,
    existing_count: int,
    corrected_from_id: uuid.UUID | None = None,
    mode: str = "advisory",
) -> RuleContext:
    return RuleContext(
        project_id=uuid.uuid4(),
        transaction_type="jmr_actual",
        transaction_id=None,
        payload={"element_id": element_id, "corrected_from_id": corrected_from_id},
        derived={"existing_jmr_count_for_element": existing_count},
        thresholds={"duplicate_pour_entry": {"mode": mode}},
    )


@pytest.mark.asyncio
async def test_passes_when_no_element_linked():
    rule = DuplicatePourEntryRule()
    result = await rule.evaluate(_ctx(element_id=None, existing_count=3))
    assert result.passed is True


@pytest.mark.asyncio
async def test_passes_on_first_entry_for_element():
    rule = DuplicatePourEntryRule()
    result = await rule.evaluate(_ctx(element_id=uuid.uuid4(), existing_count=0))
    assert result.passed is True


@pytest.mark.asyncio
async def test_fails_advisory_on_second_entry_without_correction_link():
    rule = DuplicatePourEntryRule()
    result = await rule.evaluate(_ctx(element_id=uuid.uuid4(), existing_count=1))
    assert result.passed is False
    assert result.mode == RuleMode.ADVISORY
    assert "already has 1 recorded JMR entry" in result.message


@pytest.mark.asyncio
async def test_passes_when_entry_is_an_explicit_correction():
    rule = DuplicatePourEntryRule()
    result = await rule.evaluate(
        _ctx(element_id=uuid.uuid4(), existing_count=1, corrected_from_id=uuid.uuid4())
    )
    assert result.passed is True


@pytest.mark.asyncio
async def test_fails_blocking_when_mode_is_blocking():
    rule = DuplicatePourEntryRule()
    result = await rule.evaluate(_ctx(element_id=uuid.uuid4(), existing_count=2, mode="blocking"))
    assert result.passed is False
    assert result.mode == RuleMode.BLOCKING
    assert "already has 2 recorded JMR entries" in result.message
