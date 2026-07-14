"""Rebar diameter parsing/normalization shared by every back-test source parser."""

import re

DIAS = [8, 10, 12, 16, 20, 25, 32]

_DIA_RE = re.compile(r"(\d+)\s*mm", re.IGNORECASE)


def parse_dia(text: str | None) -> int | None:
    """Extract a rebar diameter (mm) from free-text like 'Rebar 12mm Fe550' or '12MM'."""
    if not text:
        return None
    match = _DIA_RE.search(text)
    if not match:
        return None
    dia = int(match.group(1))
    return dia if dia in DIAS else None


def empty_dia_totals() -> dict[int, float]:
    return {dia: 0.0 for dia in DIAS}
