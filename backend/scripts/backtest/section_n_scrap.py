"""Section N (Scrap Sold) — summed directly from the Scrap Sale ledger.

Per the product's operating model: N is not a formula derived from other
sections, it's a direct pass-through of whatever scrap-sale line items have
been entered. This parser sums the QTY column (in KG, converted to MT)
across every genuine sale-line row, and deliberately does NOT try to match
the legacy Excel's stated N — if the two disagree, that disagreement is
itself the finding to report, not something to reverse-engineer away.

The sheet has no per-dia breakdown (scrap is sold as mixed reinforcement
scrap, not sorted by original bar diameter), so N is a single total, not
a dia-wise dict like the other sections.
"""

from pathlib import Path

import openpyxl

REQUIRED_MATERIAL_SUBSTR = "scrap"


def parse_section_n(workbook_path: Path, sheet_name: str = "Steel Scrap-28.01.2026") -> float:
    wb = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
    ws = wb[sheet_name]

    total_kg = 0.0
    for row in ws.iter_rows(values_only=True):
        material = row[7] if len(row) > 7 else None
        uom = row[8] if len(row) > 8 else None
        qty = row[9] if len(row) > 9 else None
        if not isinstance(material, str) or REQUIRED_MATERIAL_SUBSTR not in material.lower():
            continue
        if not isinstance(uom, str) or uom.strip().upper() != "KG":
            continue
        try:
            total_kg += float(qty)
        except (TypeError, ValueError):
            continue

    return total_kg / 1000.0


if __name__ == "__main__":
    import sys

    wb_path = Path(sys.argv[1])
    total_mt = parse_section_n(wb_path)
    print(f"Section N (Scrap Sold): {total_mt:.3f} MT")
