"""Load real SAP-extracted data into the APAS project ONLY, and link/replace
existing rows where the new data is a genuine fidelity improvement.

Source: "Apas SAP DOCS 26-Apr-26.XLSX" (real SAP exports, verified this
session cell-by-cell). Three things happen here, each independently verified
before being written:

1. PURCHASE ORDERS -- 89 real POs + their line items, from the "Rebar vendor
   dump" sheet. Verified: the 89 PO numbers here are an EXACT set match
   (zero difference either direction) against the 89 distinct po_reference
   values already sitting in grn.po_reference -- these are genuinely the
   same POs, not a different population. Purely additive.

2. GRN <-> PO LINKING -- grn.po_id set wherever po_reference matches a
   newly-loaded po_number. This is what finally activates the
   inbound_reconciliation rule on real historical data (previously 0% linked).

3. STORE ISSUE (Section D) REPLACEMENT -- the existing 14 aggregate
   store_issue rows (one per contractor+dia, tagged issuing_staff=
   'apas-backfill-v1') are replaced by ~1200 real per-transaction SAP
   movement-311 rows from the "issued to contractor" sheet. Verified: netting
   the paired storage-location entries (0010/0060 -> 1010/1020, subtracting
   returns) gives 28,336.97 MT total vs the existing aggregate's 28,473.64 MT
   -- 0.48% apart. This is a genuine granularity upgrade (1200 real dated
   transactions vs 14 synthetic aggregates), not a correction of a known error.

Deliberately NOT done here: replacing Section B (inter_site_transfer) with
the "Inter transfer" sheet's data. Verified: that sheet's genuine
outbound-from-APAS rebar rows ("APAS TO RAKA*", correctly sign-filtered) sum
to only 45.93 MT, far short of the existing 757.91 MT B figure -- which is
already cross-validated against TWO independent sources (the master
workbook's own Qty Backup sheet, and the separate company-wide Recon Steel
consolidated statement, both matching to the decimal). Loading the SAP
sheet's smaller figure would be a regression, not an improvement, so B is
left untouched.

Idempotent: purchase_order rows keyed by (project_id, po_number) --
delete-then-insert. store_issue rows tagged issuing_staff=
'apas-sap-transactional-v1', distinct from the old aggregate tag, so a
re-run replaces only this script's own prior rows.

Run: venv/Scripts/python.exe scripts/load_real_sap_data_apas.py [--dry-run]
"""
import asyncio
import sys
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

import openpyxl
from sqlalchemy import text

sys.path.insert(0, ".")

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402

DRY_RUN = "--dry-run" in sys.argv

SAP_DOCS_PATH = r"D:\Abhijith P\Downloads\Apas\Apas SAP DOCS 26-Apr-26.XLSX"
APAS_PROJECT_ID = uuid.UUID("e65be35f-6e04-4183-9f52-d32707fb7197")  # "My Home APAS" -- verified, not the placeholder
ISSUE_TAG = "apas-sap-transactional-v1"

# vendor name (as it appears, prefix-stripped) -> existing vendors.id.
# Verified by exact/prefix match against `SELECT id, name FROM vendors` --
# JSW's two SAP vendor codes (101359, 104055) share one name and one DB row;
# Archana's two SAP vendor codes are two genuinely distinct DB vendor rows.
VENDOR_MAP = {
    "Devashree Ispat (P) Ltd": "3ed4b4ed-d757-438c-9e0a-582f9a0d24c2",
    "MS Agarwal Foundries Pvt": "b57e6758-e343-4369-abb0-2384f0d7355f",
    "JSW Steel Limited": "1995a796-621c-4ecf-bdce-174d6b6133db",
    "JSW Steel Ltd": "0b35d9ca-620f-4b5a-92cd-c4d364257138",
    "Archana Iron Traders Pri": "e376ab73-a6a6-4b25-beea-f4192e273583",
    "Jindal Steel & Power Lim": "03fdc0e5-f686-4354-887a-bf269b21f2b0",
    "Radha Smelters Private L": "ec0cb624-db81-4b75-8a0c-ad26afcd8f27",
    "Sugna Metals Limited": "945eb6e9-19bf-48e9-9d51-f1affa86e066",
    "Steel Authority of India": "9f056522-97b5-49b4-b8d3-b440bfabf497",
    "Salasar Iron and Steel P": "634c8002-06d0-4448-824c-b172a6d0e830",
    "Archana Iron Traders Pvt": "0837da87-08d6-4444-8a54-884bad870bda",
}

MATERIAL_TO_DIA = {
    "10000160": "8", "10000161": "10", "10000162": "12", "10000163": "16",
    "10000341": "20", "10000342": "25", "10000662": "32",
}

CONTRACTOR_MAP = {
    "KLC Constructions": "e344281c-da96-40bf-890c-b6a6b745454e",
    "Guruleela Construction LLP": "43ea195b-8059-4816-915b-0ed604b593bb",
}


def strip_vendor_code(raw: str) -> str:
    """'100896     Devashree Ispat (P) Ltd' -> 'Devashree Ispat (P) Ltd'"""
    parts = raw.strip().split(None, 1)
    return parts[1].strip() if len(parts) == 2 else raw.strip()


async def load_purchase_orders(session, dia_ids: dict, created_by, stats: dict):
    wb = openpyxl.load_workbook(SAP_DOCS_PATH, data_only=True, read_only=True)
    ws = wb["Rebar vendor dump"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    po_lines = defaultdict(list)   # po_number -> [ (dia, qty_mt, rate, vendor_name, doc_date) ]
    po_vendor = {}
    po_min_date = {}
    for r in rows:
        po_number = str(r[13]).strip() if r[13] else None
        if not po_number:
            continue
        vendor_name = strip_vendor_code(r[1])
        material = str(r[2]).strip()
        dia = MATERIAL_TO_DIA.get(material)
        qty_mt = r[5]
        rate = r[8]
        doc_date = r[30]
        if dia is None or not qty_mt:
            continue
        po_lines[po_number].append((dia, Decimal(str(qty_mt)), Decimal(str(rate or 0))))
        po_vendor[po_number] = vendor_name
        d = doc_date.date() if hasattr(doc_date, "date") else doc_date
        if d and (po_number not in po_min_date or d < po_min_date[po_number]):
            po_min_date[po_number] = d

    # idempotent: delete any prior load of these exact PO numbers for this project.
    # grn.po_id references purchase_order with no ON DELETE action, so a
    # second run's DELETE would violate that FK unless the links are cleared
    # first -- the very next phase (link_grn_to_po) re-creates them anyway.
    po_numbers = list(po_lines.keys())
    await session.execute(
        text(
            "UPDATE grn SET po_id = NULL WHERE project_id = :pid "
            "AND po_id IN (SELECT id FROM purchase_order WHERE project_id = :pid AND po_number = ANY(:pos))"
        ),
        {"pid": APAS_PROJECT_ID, "pos": po_numbers},
    )
    deleted = (
        await session.execute(
            text("DELETE FROM purchase_order WHERE project_id = :pid AND po_number = ANY(:pos) RETURNING id"),
            {"pid": APAS_PROJECT_ID, "pos": po_numbers},
        )
    ).fetchall()
    if deleted:
        print(f"Replaced {len(deleted)} existing purchase_order rows from a prior run")

    inserted_po = 0
    inserted_lines = 0
    for po_number, lines in po_lines.items():
        vendor_name = po_vendor[po_number]
        vendor_id = VENDOR_MAP.get(vendor_name)
        if vendor_id is None:
            print(f"  WARNING: no vendor mapping for {vendor_name!r} (PO {po_number}) -- skipped")
            continue
        order_date = po_min_date.get(po_number) or date(2023, 9, 1)

        po_id = (
            await session.execute(
                text(
                    "INSERT INTO purchase_order (project_id, po_number, vendor_id, order_date, status, created_by) "
                    "VALUES (:pid, :pon, :vid, :od, 'closed', :cb) RETURNING id"
                ),
                {"pid": APAS_PROJECT_ID, "pon": po_number, "vid": vendor_id, "od": order_date, "cb": created_by},
            )
        ).scalar_one()
        inserted_po += 1

        for dia, qty_mt, rate in lines:
            await session.execute(
                text(
                    "INSERT INTO purchase_order_line (project_id, po_id, dia_grade_id, ordered_qty_kg, rate_per_kg) "
                    "VALUES (:pid, :po_id, :dia, :qty, :rate)"
                ),
                {
                    "pid": APAS_PROJECT_ID, "po_id": po_id, "dia": dia_ids[dia],
                    "qty": qty_mt * 1000, "rate": (rate / 1000) if rate else None,
                },
            )
            inserted_lines += 1

    stats["po_inserted"] = inserted_po
    stats["po_lines_inserted"] = inserted_lines
    print(f"Loaded {inserted_po} purchase orders, {inserted_lines} line items")


async def link_grn_to_po(session, stats: dict):
    result = await session.execute(
        text(
            """
            UPDATE grn SET po_id = po.id
            FROM purchase_order po
            WHERE grn.project_id = :pid AND po.project_id = :pid
              AND grn.po_reference = po.po_number
              AND grn.po_id IS NULL
            RETURNING grn.id
            """
        ),
        {"pid": APAS_PROJECT_ID},
    )
    linked = result.fetchall()
    stats["grn_linked"] = len(linked)
    print(f"Linked {len(linked)} GRN rows to real purchase orders")

    # verification: how many GRNs remain unlinked, and how many real POs got zero GRNs
    unlinked = (
        await session.execute(
            text("SELECT count(*) FROM grn WHERE project_id = :pid AND po_id IS NULL"), {"pid": APAS_PROJECT_ID}
        )
    ).scalar_one()
    print(f"GRN rows still unlinked (no po_reference match): {unlinked}")


async def replace_store_issue(session, dia_ids: dict, created_by, stats: dict):
    deleted = (
        await session.execute(
            text("DELETE FROM store_issue WHERE project_id = :pid AND issuing_staff = :tag RETURNING id"),
            {"pid": APAS_PROJECT_ID, "tag": ISSUE_TAG},
        )
    ).fetchall()
    if deleted:
        print(f"Replaced {len(deleted)} existing real-transactional store_issue rows from a prior run")

    # also remove the OLD aggregate rows this replaces (tagged from the original backfill)
    deleted_agg = (
        await session.execute(
            text(
                "DELETE FROM store_issue WHERE project_id = :pid AND issuing_staff = 'apas-backfill-v1' "
                "AND contractor_id = ANY(:cids) RETURNING id"
            ),
            {"pid": APAS_PROJECT_ID, "cids": list(CONTRACTOR_MAP.values())},
        )
    ).fetchall()
    if deleted_agg:
        print(f"Removed {len(deleted_agg)} old aggregate store_issue rows being superseded")

    wb = openpyxl.load_workbook(SAP_DOCS_PATH, data_only=True, read_only=True)
    ws = wb["issued to contractor"]
    inserted = 0
    for r in ws.iter_rows(min_row=2, values_only=True):
        storloc = r[9]
        if storloc not in ("1010", "1020"):
            continue
        qty = r[13]
        if qty is None or qty == 0:
            continue
        vendor_name = (r[5] or "").strip()
        contractor_id = CONTRACTOR_MAP.get(vendor_name)
        if contractor_id is None:
            continue
        material_desc = (r[11] or "")
        dia = next((d for d, mm in [("8", "08mm"), ("10", "10mm"), ("12", "12mm"), ("16", "16mm"),
                                      ("20", "20mm"), ("25", "25mm"), ("32", "32mm")] if mm in material_desc), None)
        if dia is None:
            continue
        posting_date = r[8]
        eff_date = posting_date.date() if hasattr(posting_date, "date") else posting_date
        direction = "out" if qty > 0 else "in"

        await session.execute(
            text(
                "INSERT INTO store_issue (project_id, contractor_id, dia_grade_id, quantity_kg, direction, "
                "issuing_staff, effective_date, created_by) "
                "VALUES (:pid, :cid, :dia, :qty, :dirn, :tag, :eff, :cb)"
            ),
            {
                "pid": APAS_PROJECT_ID, "cid": contractor_id, "dia": dia_ids[dia],
                "qty": abs(Decimal(str(qty))) * 1000, "dirn": direction,
                "tag": ISSUE_TAG, "eff": eff_date, "cb": created_by,
            },
        )
        inserted += 1

    stats["store_issue_inserted"] = inserted
    print(f"Loaded {inserted} real per-transaction store_issue rows")


async def main():
    stats = {}
    engine = create_async_engine(settings.migration_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        created_by = (
            await session.execute(text("SELECT id FROM users ORDER BY created_at LIMIT 1"))
        ).scalar_one()

        dia_rows = (
            await session.execute(text("SELECT id, diameter_mm FROM dia_grades"))
        ).fetchall()
        dia_ids = {str(int(r.diameter_mm)): r.id for r in dia_rows}

        await load_purchase_orders(session, dia_ids, created_by, stats)
        await link_grn_to_po(session, stats)
        await replace_store_issue(session, dia_ids, created_by, stats)

        if DRY_RUN:
            print("\n[DRY RUN] rolling back -- nothing written")
            await session.rollback()
        else:
            await session.commit()
            print("\nCommitted.")

    print("\nSummary:", stats)


if __name__ == "__main__":
    asyncio.run(main())
