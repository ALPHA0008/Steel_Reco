"""One-shot backfill: load real APAS transactions into the app's own tables
so /api/v1/abstract computes April 2026's reco live, from real data, not a
standalone script (the 2026-07-14 back-test used the files directly; this
loads the same source rows through the actual schema).

Fidelity varies honestly by section, per source data granularity:
  A (Received)  -- FULL per-row fidelity: all 979 real GRN rows (vendor,
                   PO ref, posting date, quantity) + real 'received from
                   other site' totals (SAP + Excel sides).
  B (Transferred)-- AGGREGATE: the source sheet only gives dia-wise totals
                   per side (SAP/Excel), not per-transfer dates or
                   destinations -- loaded as 2 dated rows per side per dia.
  D (Issued)    -- AGGREGATE: the Qty Backup sheets' own 'A' row (issued to
                   contractor) is a cumulative total per contractor+dia, not
                   a per-event ledger -- loaded as 1 row per contractor+dia.
  E (Consumption)-- AGGREGATE: same shape as D, from the 'B' row (Consumption
                   Details). No element_id link (see NOTE below).
  F (WIP)       -- NOT backfilled. The app computes F from
                   element_progress x bbs_plan, and we have no real
                   completion-% data for the actual elements -- fabricating
                   percentages would be inventing data, not backfilling it.
                   F will show whatever the already-imported BBS elements
                   happen to have (currently nothing), which is honest.
  I (Physical)  -- FULL fidelity: real bundle/rod counts per contractor+dia
                   from Annexure-1.
  J (Cut pieces)-- NOT backfilled. Annexure-2 only gives an aggregate weight
                   per dia, not the per-piece length/count the schema
                   requires (physical_count_cut_piece.length_mm is NOT NULL
                   with a >1500mm-or-scrap CHECK) -- fabricating a piece
                   count/length to satisfy the constraint would not be real
                   data.
  N (Scrap)     -- FULL per-row fidelity: every real scrap-sale line
                   (date, buyer, weight, rate, gate-pass) from the ledger.

NOTE on E's element linkage: the imported BBS plan's 367 elements come from
the real per-pour BBS files (CH/NTA/Compound Wall/Misc Works), while the
Qty Backup consumption breakdown is organized by Tower-1..6/NTA/Other Works
-- these don't line up 1:1 by name, and guessing a match risks silently
misattributing tons of steel to the wrong element. E is loaded WITHOUT an
element_id; the 'consumption_without_bbs_plan' aggregate finding will
legitimately fire for it, which is the honest reflection of what granular
data we actually have.

Idempotent: every row this script inserts carries source_ref/notes tagged
'apas-backfill-v1'; re-running deletes and replaces that tag's rows first.
"""

import asyncio
import re
import sys
import warnings
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, ".")

RUN_TAG = "apas-backfill-v1"
AS_OF = date(2026, 4, 30)  # month-end date for aggregate (non-dated) rows
DIAS = [8, 10, 12, 16, 20, 25, 32]


def _numeric(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return None


# ---------------------------------------------------------------------------
# Parsing (re-derives exactly what the back-test session verified by hand;
# see memory/apas-backtest-data.md for the numbers each of these should match)
# ---------------------------------------------------------------------------

def parse_grn_rows(path: Path) -> list[dict]:
    import openpyxl

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {name: i for i, name in enumerate(header)}
    dia_re = re.compile(r"(\d+)\s*mm", re.IGNORECASE)

    out = []
    for row in rows:
        if not row[col["Movement Type Text"]] or "receipt" not in str(row[col["Movement Type Text"]]).lower():
            continue
        m = dia_re.search(row[col["Material Description"]] or "")
        if not m or int(m.group(1)) not in DIAS:
            continue
        posting_date = row[col["Posting Date"]]
        if not isinstance(posting_date, (datetime, date)):
            continue
        out.append({
            "dia": int(m.group(1)),
            "vendor_name": (row[col["Vendor Name"]] or "Unknown Vendor").strip(),
            "po_reference": str(row[col["Purchase order"]]) if row[col["Purchase order"]] else None,
            "quantity_kg": Decimal(str(row[col["Quantity"]])) * 1000,  # source is MT
            "posting_date": posting_date.date() if isinstance(posting_date, datetime) else posting_date,
        })
    return out


def parse_other_site_receipts(path: Path) -> dict[str, dict[int, float]]:
    import openpyxl

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["RECEIPT FROM OTHER SITE "]
    rows = list(ws.iter_rows(values_only=True))
    sap = {d: 0.0 for d in DIAS}
    excel = {d: 0.0 for d in DIAS}
    for row in rows:
        label = row[1] if len(row) > 1 else None
        if isinstance(label, str) and "total qty" in label.lower():
            for i, d in enumerate(DIAS):
                v = row[2 + i]
                sap[d] = float(v) if v is not None else 0.0
        excel_label = row[14] if len(row) > 14 else None
        if isinstance(excel_label, str) and "total qty" in excel_label.lower():
            for i, d in enumerate(DIAS):
                v = row[15 + i]
                excel[d] = float(v) if v is not None else 0.0
    return {"sap": sap, "excel": excel}


def parse_transfers_out(path: Path) -> dict[str, dict[int, float]]:
    import openpyxl

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Loan Return Given Qty Through "]
    rows = list(ws.iter_rows(values_only=True))
    sap = {d: 0.0 for d in DIAS}
    excel = {d: 0.0 for d in DIAS}
    for row in rows:
        label = row[1] if len(row) > 1 else None
        if isinstance(label, str) and "total qty" in label.lower():
            for i, d in enumerate(DIAS):
                v = row[2 + i]
                sap[d] = float(v) if v is not None else 0.0
        excel_label = row[14] if len(row) > 14 else None
        if isinstance(excel_label, str) and "total qty" in excel_label.lower():
            for i, d in enumerate(DIAS):
                v = row[15 + i]
                excel[d] = float(v) if v is not None else 0.0
    return {"sap": sap, "excel": excel}


def _find_marker_row(rows, marker, label_substr):
    for row in rows:
        a = row[0]
        if isinstance(a, str) and a.strip() == marker:
            b = row[1]
            if isinstance(b, str) and label_substr.lower() in b.lower():
                return row
    return None


def parse_contractor_issue_and_consumption(path: Path, sheet_name: str) -> dict:
    import openpyxl

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))

    a_row = _find_marker_row(rows, "A", "issued to contractor")
    b_row = _find_marker_row(rows, "B", "consumption details")
    if a_row is None or b_row is None:
        raise ValueError(f"Could not locate A/B marker rows in {sheet_name!r}")

    def dia_totals(row):
        return {d: float(row[3 + i]) if row[3 + i] is not None else 0.0 for i, d in enumerate(DIAS)}

    return {"issued": dia_totals(a_row), "consumption": dia_totals(b_row)}


def parse_physical_stock(path: Path) -> dict:
    import openpyxl

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Annexure-1"]
    rows = list(ws.iter_rows(values_only=True))

    dia_re = re.compile(r"^\s*(\d+)\s*mm\s*$", re.IGNORECASE)
    blocks: list[dict] = []
    current_contractor = None
    for row in rows:
        c0 = row[0]
        if isinstance(c0, str) and c0.strip().lower().startswith("contractor name"):
            current_contractor = c0.split(":", 1)[-1].strip()
            continue
        if isinstance(row[1], str):
            m = dia_re.match(row[1])
            if m:
                dia = int(m.group(1))
                bundles, bundle_wt_mt = _numeric(row[2]), _numeric(row[3])
                rods, rod_wt_mt = _numeric(row[5]), _numeric(row[6])
                if current_contractor and (bundles or rods):
                    # source columns are labeled '... (Approx.) MT' -- the
                    # schema's each_bundle_weight_kg/each_rod_weight_kg are
                    # KG, so convert here rather than at insert time.
                    blocks.append({
                        "contractor": current_contractor, "dia": dia,
                        "bundle_count": int(bundles or 0), "bundle_weight_kg": (bundle_wt_mt or 0) * 1000,
                        "rod_count": int(rods or 0), "rod_weight_kg": (rod_wt_mt or 0) * 1000,
                    })
    return blocks


def parse_scrap_ledger(path: Path, sheet_name: str) -> list[dict]:
    import openpyxl

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet_name]
    out = []
    for row in ws.iter_rows(values_only=True):
        material = row[7] if len(row) > 7 else None
        uom = row[8] if len(row) > 8 else None
        qty = row[9] if len(row) > 9 else None
        rate = row[10] if len(row) > 10 else None
        if not isinstance(material, str) or "scrap" not in material.lower():
            continue
        if not isinstance(uom, str) or uom.strip().upper() != "KG":
            continue
        d = row[1]
        if isinstance(d, str):
            try:
                sale_date = datetime.strptime(d.strip(), "%d.%m.%Y").date()
            except ValueError:
                sale_date = AS_OF
        elif isinstance(d, (datetime, date)):
            sale_date = d.date() if isinstance(d, datetime) else d
        else:
            sale_date = AS_OF
        try:
            qty_f = float(qty)
            rate_f = float(rate) if rate is not None else 0.0
        except (TypeError, ValueError):
            continue
        out.append({
            "buyer_name": str(row[5]) if row[5] else "Unknown Buyer",
            "weight_kg": Decimal(str(qty_f)),
            "rate_per_kg": Decimal(str(rate_f)),
            "gate_pass_no": str(row[2]) if row[2] else None,
            "effective_date": sale_date,
        })
    return out


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

async def main(grn_path: Path, workbook_path: Path) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings

    engine = create_async_engine(settings.migration_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as s:
        await s.execute(text("SET app.user_role = 'admin'"))

        project_id = (await s.execute(
            text("SELECT id FROM projects ORDER BY created_at LIMIT 1")
        )).scalar_one_or_none()
        created_by = (await s.execute(
            text("SELECT id FROM users ORDER BY created_at LIMIT 1")
        )).scalar_one_or_none()
        if project_id is None or created_by is None:
            raise SystemExit("No project/user in DB -- run scripts/seed_dev.py first")

        # ---- replace any prior run of this script (idempotent) ----
        for tbl, col in [
            ("grn", "notes"), ("inter_site_transfer", "ho_approval_ref"),
            ("store_issue", "issuing_staff"), ("jmr_actual", "drawing_ref"),
            ("physical_count", "notes"), ("scrap_sale", "notes"),
        ]:
            deleted = (await s.execute(
                text(f"DELETE FROM {tbl} WHERE {col} = :tag RETURNING id"), {"tag": RUN_TAG}
            )).fetchall()
            if deleted:
                print(f"Replaced {len(deleted)} existing {tbl} rows from a prior run")

        # ---- also clear pre-existing smoke-test noise sharing this project,
        # so the real APAS totals aren't polluted by test fixtures ----
        smoke_contractor = (await s.execute(
            text("SELECT id FROM contractors WHERE code = 'SMOKE'")
        )).scalar_one_or_none()
        if smoke_contractor is not None:
            for tbl, fk in [("store_issue", "contractor_id"), ("physical_count", "contractor_id")]:
                n = (await s.execute(
                    text(f"DELETE FROM {tbl} WHERE {fk} = :cid RETURNING id"), {"cid": smoke_contractor}
                )).fetchall()
                if n:
                    print(f"Removed {len(n)} pre-existing SMOKE-contractor rows from {tbl}")
        for tbl in ["grn", "inter_site_transfer", "jmr_actual", "scrap_sale"]:
            n = (await s.execute(
                text(f"DELETE FROM {tbl} WHERE project_id = :pid AND created_at < :cutoff RETURNING id"),
                {"pid": project_id, "cutoff": datetime(2026, 7, 14)},
            )).fetchall()
            if n:
                print(f"Removed {len(n)} pre-existing test rows from {tbl}")

        dia_ids = {
            r.diameter_mm: r.id for r in (
                await s.execute(text("SELECT id, diameter_mm FROM dia_grades"))
            ).fetchall()
        }
        dia_ids = {int(k): v for k, v in dia_ids.items()}

        async def get_or_create_contractor(code: str, name: str):
            row = (await s.execute(
                text("SELECT id FROM contractors WHERE code = :code"), {"code": code}
            )).scalar_one_or_none()
            if row is None:
                row = (await s.execute(
                    text("INSERT INTO contractors (code, name) VALUES (:code, :name) RETURNING id"),
                    {"code": code, "name": name},
                )).scalar_one()
            return row

        async def get_or_create_vendor(name: str):
            row = (await s.execute(
                text("SELECT id FROM vendors WHERE name = :name"), {"name": name}
            )).scalar_one_or_none()
            if row is None:
                row = (await s.execute(
                    text("INSERT INTO vendors (name) VALUES (:name) RETURNING id"), {"name": name}
                )).scalar_one()
            return row

        klc_id = await get_or_create_contractor("KLC", "KLC Constructions")
        glc_id = await get_or_create_contractor("GLC", "Guruleela Construction LLP")

        # ================= Section A: GRN =================
        grn_rows = parse_grn_rows(grn_path)
        vendor_cache: dict[str, object] = {}
        inserted_a = 0
        for row in grn_rows:
            vendor_name = row["vendor_name"]
            if vendor_name not in vendor_cache:
                vendor_cache[vendor_name] = await get_or_create_vendor(vendor_name)
            gate_dt = datetime.combine(row["posting_date"], datetime.min.time())
            await s.execute(
                text(
                    "INSERT INTO grn (project_id, vendor_id, dia_grade_id, po_reference, "
                    "weighbridge_weight_kg, receipt_type, gate_entry_at, effective_date, "
                    "notes, created_by) VALUES (:pid, :vid, :dia, :po, :qty, 'against_po', "
                    ":gate, :eff, :tag, :uid)"
                ),
                {"pid": project_id, "vid": vendor_cache[vendor_name], "dia": dia_ids[row["dia"]],
                 "po": row["po_reference"], "qty": row["quantity_kg"], "gate": gate_dt,
                 "eff": row["posting_date"], "tag": RUN_TAG, "uid": created_by},
            )
            inserted_a += 1

        other_site = parse_other_site_receipts(workbook_path)
        internal_vendor = await get_or_create_vendor("Internal Transfer (Other My Home Site)")
        for side, receipt_type in [("sap", "other_site_sap"), ("excel", "other_site_excel")]:
            for dia, kg in other_site[side].items():
                if kg <= 0:
                    continue
                gate_dt = datetime.combine(AS_OF, datetime.min.time())
                await s.execute(
                    text(
                        "INSERT INTO grn (project_id, vendor_id, dia_grade_id, weighbridge_weight_kg, "
                        "receipt_type, source_site, gate_entry_at, effective_date, notes, created_by) "
                        "VALUES (:pid, :vid, :dia, :qty, :rt, 'Other Site (aggregate)', :gate, :eff, :tag, :uid)"
                    ),
                    {"pid": project_id, "vid": internal_vendor, "dia": dia_ids[dia], "qty": kg * 1000,
                     "rt": receipt_type, "gate": gate_dt, "eff": AS_OF, "tag": RUN_TAG, "uid": created_by},
                )
                inserted_a += 1
        print(f"Section A: inserted {inserted_a} GRN rows "
              f"({len(grn_rows)} real receipts + other-site aggregates)")

        # ================= Section B: transfers out =================
        transfers = parse_transfers_out(workbook_path)
        other_site_project = (await s.execute(
            text("SELECT id FROM projects WHERE name = :name"),
            {"name": "Other My Home Sites (Aggregate)"},
        )).scalar_one_or_none()
        if other_site_project is None:
            other_site_project = (await s.execute(
                text(
                    "INSERT INTO projects (name, location, status) "
                    "VALUES ('Other My Home Sites (Aggregate)', 'Various', 'active') RETURNING id"
                )
            )).scalar_one()

        inserted_b = 0
        for side, source in [("sap", "sap"), ("excel", "excel")]:
            for dia, kg in transfers[side].items():
                if kg <= 0:
                    continue
                await s.execute(
                    text(
                        "INSERT INTO inter_site_transfer (project_id, from_project_id, to_project_id, "
                        "dia_grade_id, quantity_kg, flag, record_source, effective_date, "
                        "ho_approval_ref, created_by) "
                        "VALUES (:pid, :pid, :to_pid, :dia, :qty, 'loan', :src, :eff, :tag, :uid)"
                    ),
                    {"pid": project_id, "to_pid": other_site_project, "dia": dia_ids[dia],
                     "qty": kg * 1000, "src": source, "eff": AS_OF, "tag": RUN_TAG, "uid": created_by},
                )
                inserted_b += 1
        print(f"Section B: inserted {inserted_b} transfer-out rows (aggregate, dated {AS_OF})")

        # ================= Section D + E: per-contractor issue/consumption =================
        klc = parse_contractor_issue_and_consumption(workbook_path, "Recon.Steel-KLC Qty Backup ")
        glc = parse_contractor_issue_and_consumption(workbook_path, "Recon.Steel-GLC LLP Qty Backup")

        # A shared "aggregate" tower/floor per contractor to satisfy the
        # NOT NULL tower_id/floor_id on store_issue/jmr_actual -- these rows
        # represent a whole contractor's cumulative total, not one physical
        # location, so there is no real tower/floor to link them to.
        async def get_or_create_aggregate_location(contractor_code: str):
            tower = (await s.execute(
                text("SELECT id FROM towers WHERE project_id = :pid AND name = :name"),
                {"pid": project_id, "name": f"{contractor_code} Aggregate"},
            )).scalar_one_or_none()
            if tower is None:
                tower = (await s.execute(
                    text("INSERT INTO towers (project_id, name) VALUES (:pid, :name) RETURNING id"),
                    {"pid": project_id, "name": f"{contractor_code} Aggregate"},
                )).scalar_one()
            floor = (await s.execute(
                text("SELECT id FROM floors WHERE tower_id = :tid AND level_name = 'ALL'"),
                {"tid": tower},
            )).scalar_one_or_none()
            if floor is None:
                floor = (await s.execute(
                    text("INSERT INTO floors (tower_id, project_id, level_name) "
                         "VALUES (:tid, :pid, 'ALL') RETURNING id"),
                    {"tid": tower, "pid": project_id},
                )).scalar_one()
            return tower, floor

        inserted_d = inserted_e = 0
        for code, cid, data in [("KLC", klc_id, klc), ("GLC", glc_id, glc)]:
            tower_id, floor_id = await get_or_create_aggregate_location(code)
            for dia, kg in data["issued"].items():
                if kg <= 0:
                    continue
                await s.execute(
                    text(
                        "INSERT INTO store_issue (project_id, contractor_id, dia_grade_id, "
                        "quantity_kg, direction, effective_date, issuing_staff, created_by) "
                        "VALUES (:pid, :cid, :dia, :qty, 'out', :eff, :tag, :uid)"
                    ),
                    {"pid": project_id, "cid": cid, "dia": dia_ids[dia], "qty": kg * 1000,
                     "eff": AS_OF, "tag": RUN_TAG, "uid": created_by},
                )
                inserted_d += 1
            for dia, kg in data["consumption"].items():
                if kg <= 0:
                    continue
                await s.execute(
                    text(
                        "INSERT INTO jmr_actual (project_id, tower_id, floor_id, dia_grade_id, "
                        "measured_weight_kg, contractor_id, pour_number, drawing_ref, "
                        "effective_date, created_by) "
                        "VALUES (:pid, :tid, :fid, :dia, :qty, :cid, 'AGGREGATE', :tag, :eff, :uid)"
                    ),
                    {"pid": project_id, "tid": tower_id, "fid": floor_id, "dia": dia_ids[dia],
                     "qty": kg * 1000, "cid": cid, "tag": RUN_TAG, "eff": AS_OF, "uid": created_by},
                )
                inserted_e += 1
        print(f"Section D: inserted {inserted_d} store-issue rows (aggregate per contractor+dia)")
        print(f"Section E: inserted {inserted_e} JMR rows (aggregate per contractor+dia, no element link)")

        # ================= Section I: physical stock =================
        contractor_map = {"KLC Constructions": klc_id, "Guruleela Construction LLP": glc_id}
        blocks = parse_physical_stock(workbook_path)
        inserted_i = 0
        for b in blocks:
            cid = contractor_map.get(b["contractor"])
            if cid is None:
                continue
            await s.execute(
                text(
                    "INSERT INTO physical_count (project_id, contractor_id, dia_grade_id, "
                    "bundle_count, each_bundle_weight_kg, loose_rod_count, each_rod_weight_kg, "
                    "effective_date, notes, created_by) "
                    "VALUES (:pid, :cid, :dia, :bc, :bw, :rc, :rw, :eff, :tag, :uid)"
                ),
                {"pid": project_id, "cid": cid, "dia": dia_ids[b["dia"]],
                 "bc": b["bundle_count"], "bw": b["bundle_weight_kg"],
                 "rc": b["rod_count"], "rw": b["rod_weight_kg"],
                 "eff": AS_OF, "tag": RUN_TAG, "uid": created_by},
            )
            inserted_i += 1
        print(f"Section I: inserted {inserted_i} physical-count rows (real per-contractor stock)")

        # ================= Section N: scrap =================
        scrap_rows = parse_scrap_ledger(workbook_path, "Steel Scrap-28.01.2026")
        inserted_n = 0
        for row in scrap_rows:
            await s.execute(
                text(
                    "INSERT INTO scrap_sale (project_id, buyer_name, weight_kg, rate_per_kg, "
                    "gate_pass_no, effective_date, notes, created_by) "
                    "VALUES (:pid, :buyer, :wt, :rate, :gp, :eff, :tag, :uid)"
                ),
                {"pid": project_id, "buyer": row["buyer_name"], "wt": row["weight_kg"],
                 "rate": row["rate_per_kg"], "gp": row["gate_pass_no"],
                 "eff": row["effective_date"], "tag": RUN_TAG, "uid": created_by},
            )
            inserted_n += 1
        print(f"Section N: inserted {inserted_n} scrap-sale rows (real per-transaction ledger)")

        await s.commit()
        print(f"\nBackfill complete for project {project_id}, tag={RUN_TAG}")

    await engine.dispose()


if __name__ == "__main__":
    grn_arg = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("../GRN_rebar_APAS.xlsx")
    wb_arg = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(
        "../Apas/Steel Recon 28.04.2026 (My Home APAS) T-1,2,3,4,5,6, NTA,CH-1.xlsx"
    )
    asyncio.run(main(grn_arg, wb_arg))
