"""Section A (Received) — parsed independently from the real SAP MIGO GRN export."""

from pathlib import Path

import openpyxl

from .dia import empty_dia_totals, parse_dia


def parse_section_a(grn_path: Path) -> dict[int, float]:
    """Sum goods-receipt quantities by rebar diameter from the SAP GRN export.

    Only rows whose Movement Type Text is a goods receipt are counted — the
    export can in principle carry reversal/cancellation movement types, and
    those must not inflate Received.
    """
    wb = openpyxl.load_workbook(grn_path, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {name: i for i, name in enumerate(header)}

    totals = empty_dia_totals()
    skipped_non_receipt = 0
    skipped_unparsed_dia = 0

    for row in rows:
        movement_text = row[col["Movement Type Text"]]
        if not movement_text or "receipt" not in str(movement_text).lower():
            skipped_non_receipt += 1
            continue
        dia = parse_dia(row[col["Material Description"]])
        if dia is None:
            skipped_unparsed_dia += 1
            continue
        qty = row[col["Quantity"]] or 0
        totals[dia] += float(qty)

    if skipped_unparsed_dia:
        print(f"[Section A] WARNING: {skipped_unparsed_dia} receipt rows had unparseable dia, excluded")
    if skipped_non_receipt:
        print(f"[Section A] {skipped_non_receipt} non-receipt rows excluded")

    return totals


if __name__ == "__main__":
    import sys

    grn_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("GRN_rebar_APAS.xlsx")
    totals = parse_section_a(grn_path)
    grand_total = sum(totals.values())
    for dia, qty in totals.items():
        print(f"{dia}mm: {qty:.3f} MT")
    print(f"TOTAL: {grand_total:.3f} MT")
