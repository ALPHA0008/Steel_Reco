"""Section B (Transferred to Other Sites) — parsed independently from the
'Loan Return Given Qty Through' sheet, which mirrors the receipt sheet's
layout: a SAP-side block (dia cols start at index 2) and an Excel-side
block (dia cols start at index 15), each with their own 'Total Qty' row.
"""

from pathlib import Path

import openpyxl

from .dia import DIAS, empty_dia_totals

SHEET_NAME = "Loan Return Given Qty Through "

SAP_DIA_COL_START = 2
EXCEL_DIA_COL_START = 15


def parse_section_b(workbook_path: Path) -> dict[str, dict[int, float]]:
    """Returns {'sap': {...}, 'excel': {...}} transferred-out totals by dia."""
    wb = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    ws = wb[SHEET_NAME]
    rows = list(ws.iter_rows(values_only=True))

    sap_totals = empty_dia_totals()
    excel_totals = empty_dia_totals()
    found = False

    for row in rows:
        label = row[1] if len(row) > 1 else None
        if isinstance(label, str) and "total qty" in label.lower():
            for i, dia in enumerate(DIAS):
                val = row[SAP_DIA_COL_START + i]
                sap_totals[dia] = float(val) if val is not None else 0.0
            found = True
        excel_label = row[14] if len(row) > 14 else None
        if isinstance(excel_label, str) and "total qty" in excel_label.lower():
            for i, dia in enumerate(DIAS):
                val = row[EXCEL_DIA_COL_START + i]
                excel_totals[dia] = float(val) if val is not None else 0.0

    if not found:
        raise ValueError(f"Could not locate 'Total Qty' row in sheet {SHEET_NAME!r}")

    return {"sap": sap_totals, "excel": excel_totals}


def parse_section_b_combined(workbook_path: Path) -> dict[int, float]:
    """Combined SAP + Excel transferred-out totals by dia (Abstract's B = sum of both)."""
    parsed = parse_section_b(workbook_path)
    combined = empty_dia_totals()
    for dia in DIAS:
        combined[dia] = parsed["sap"][dia] + parsed["excel"][dia]
    return combined


if __name__ == "__main__":
    import sys

    wb_path = Path(sys.argv[1])
    result = parse_section_b(wb_path)
    for side, totals in result.items():
        print(f"{side}: {totals}  TOTAL={sum(totals.values()):.3f}")
    combined = parse_section_b_combined(wb_path)
    print(f"combined: {combined}  TOTAL={sum(combined.values()):.3f}")
