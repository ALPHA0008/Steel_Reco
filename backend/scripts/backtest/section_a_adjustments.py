"""Section A (Received) adjustment lines beyond the SAP GRN export:
'Received from Other Site' — inter-site transfers received here, tracked in
their own workbook sheet with SAP-side and Excel-side sub-totals.

This sheet's row layout is irregular (merged/blank header rows, a second
block of columns to the right for the 'as per Excel' side) so we locate the
'Total Qty' label rows explicitly rather than a fixed offset.
"""

from pathlib import Path

import openpyxl

from .dia import DIAS, empty_dia_totals

SHEET_NAME = "RECEIPT FROM OTHER SITE "

# SAP-side block: dia cols start at index 2; Excel-side block: dia cols start at index 15
SAP_DIA_COL_START = 2
EXCEL_DIA_COL_START = 15


def parse_receipt_from_other_site(workbook_path: Path) -> dict[str, dict[int, float]]:
    """Returns {'sap': {...}, 'excel': {...}} totals by dia.

    NOTE: the 'excel' side total row only carries a non-zero value in the
    25mm column (596.81) in this export. The Abstract's own 'Received from
    Other Site as per Excel' line also shows 398.08 for 8mm with no matching
    total row anywhere in this sheet as of this parse. Flagged as
    UNRECONCILED rather than guessed — see backtest report.
    """
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


if __name__ == "__main__":
    import sys

    wb_path = Path(sys.argv[1])
    result = parse_receipt_from_other_site(wb_path)
    for side, totals in result.items():
        print(f"{side}: {totals}  TOTAL={sum(totals.values()):.3f}")
