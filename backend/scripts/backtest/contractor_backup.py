"""Sections B (Consumption) and C (WIP) — parsed independently from the
per-contractor 'Recon.Steel-<X> Qty Backup' sheets.

Each contractor sheet lays out a fixed A/B/C/D/E/F/G/H chain in column 0
(S.NO), with per-dia totals in columns 3-9 (8/10/12/16/20/25/32mm) and a
row grand-total in column 10. We locate rows by their marker letter + label
substring rather than a hardcoded row number, since KLC and GLC sheets carry
the same layout at different row offsets.
"""

from pathlib import Path

import openpyxl

from .dia import DIAS, empty_dia_totals

CONTRACTOR_SHEETS = [
    "Recon.Steel-KLC Qty Backup ",
    "Recon.Steel-GLC LLP Qty Backup",
]

# dia columns are the 7 cells right after (S.NO, DESCRIPTION, Ref.)
DIA_COL_START = 3


def _find_marker_row(rows: list[tuple], marker: str, label_substr: str) -> tuple | None:
    for row in rows:
        a = row[0]
        if isinstance(a, str) and a.strip() == marker:
            b = row[1]
            if isinstance(b, str) and label_substr.lower() in b.lower():
                return row
    return None


def _dia_totals_from_row(row: tuple) -> dict[int, float]:
    totals = empty_dia_totals()
    for i, dia in enumerate(DIAS):
        val = row[DIA_COL_START + i]
        totals[dia] = float(val) if val is not None else 0.0
    return totals


def parse_contractor_sheet(workbook_path: Path, sheet_name: str) -> dict[str, dict[int, float]]:
    """Return {'B': {...}, 'C': {...}} independent Consumption/WIP totals for one contractor."""
    wb = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))

    b_row = _find_marker_row(rows, "B", "consumption details")
    c_row = _find_marker_row(rows, "C", "work in progress")
    if b_row is None or c_row is None:
        raise ValueError(f"Could not locate B/C marker rows in sheet {sheet_name!r}")

    return {
        "B": _dia_totals_from_row(b_row),
        "C": _dia_totals_from_row(c_row),
    }


def parse_all_contractors(workbook_path: Path) -> dict[int, float]:
    """Sum B (Consumption) across all contractor sheets, by dia — Section E source."""
    consumption = empty_dia_totals()
    for sheet_name in CONTRACTOR_SHEETS:
        parsed = parse_contractor_sheet(workbook_path, sheet_name)
        for dia in DIAS:
            consumption[dia] += parsed["B"][dia]
    return consumption


def parse_all_wip(workbook_path: Path) -> dict[int, float]:
    """Sum C (WIP) across all contractor sheets, by dia — Section F source."""
    wip = empty_dia_totals()
    for sheet_name in CONTRACTOR_SHEETS:
        parsed = parse_contractor_sheet(workbook_path, sheet_name)
        for dia in DIAS:
            wip[dia] += parsed["C"][dia]
    return wip


if __name__ == "__main__":
    import sys

    wb_path = Path(sys.argv[1])
    for sheet_name in CONTRACTOR_SHEETS:
        parsed = parse_contractor_sheet(wb_path, sheet_name)
        print(f"=== {sheet_name} ===")
        for section, totals in parsed.items():
            grand = sum(totals.values())
            print(f"  {section}: {totals}  TOTAL={grand:.3f}")

    print("\n=== Combined (Section E / F sources) ===")
    consumption = parse_all_contractors(wb_path)
    wip = parse_all_wip(wb_path)
    print(f"Consumption (E): {consumption}  TOTAL={sum(consumption.values()):.3f}")
    print(f"WIP (F):         {wip}  TOTAL={sum(wip.values()):.3f}")
