"""Reads the legacy Excel's own stated A-N values from 'Abstract (Newformat)'
so the back-test has something to diff independently-computed numbers against.
"""

from pathlib import Path

import openpyxl

from .dia import DIAS, empty_dia_totals

SHEET_NAME = "Abstract (Newformat)"

# (row index in 0-indexed iter_rows, section letter) for each top-level total row
SECTION_ROWS = {
    "A": 5,
    "B": 10,
    "C": 14,
    "D": 16,
    "E": 20,
    "F": 25,
    "G": 29,
    "H": 31,
    "I": 33,
    "J": 38,
    "K": 42,
    "L": 44,
}

DIA_COL_START = 2  # columns 2-8 are 8/10/12/16/20/25/32mm


def parse_abstract_ground_truth(workbook_path: Path) -> dict[str, dict[int, float]]:
    wb = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    ws = wb[SHEET_NAME]
    rows = list(ws.iter_rows(values_only=True))

    result: dict[str, dict[int, float]] = {}
    for section, row_idx in SECTION_ROWS.items():
        row = rows[row_idx]
        totals = empty_dia_totals()
        for i, dia in enumerate(DIAS):
            val = row[DIA_COL_START + i]
            totals[dia] = float(val) if isinstance(val, (int, float)) else 0.0
        result[section] = totals

    # M (wastage %) and N (scrap sold) are single scalars, not dia-wise.
    m_row = rows[45]
    n_row = rows[47]
    result["M"] = m_row[9]  # TOTAL column
    result["N"] = n_row[8]  # value sits in the TOTAL-ish column, not dia-wise

    return result


if __name__ == "__main__":
    import sys

    wb_path = Path(sys.argv[1])
    gt = parse_abstract_ground_truth(wb_path)
    for section, totals in gt.items():
        if isinstance(totals, dict):
            print(f"{section}: {totals}  TOTAL={sum(totals.values()):.3f}")
        else:
            print(f"{section}: {totals}")
