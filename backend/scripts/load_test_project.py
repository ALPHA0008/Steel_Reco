"""One-shot loader: create a brand-new "Test Project" account and feed it
the 9 dummy SAP-format files from D:\\Abhijith P\\Downloads\\Apas\\TestProject\\,
by PARSING the actual xlsx files (not reading design2.py's in-memory state) --
this proves the files themselves are loadable, not just that the generator's
numbers are internally consistent.

Scope discipline: every write in this script is scoped to a freshly-created
project_id captured at the top of main(). Nothing here ever looks up "the
first project" or loops over all projects -- the real APAS project is never
touched, by construction (there is no code path that could reach it).

Sections loaded, and their real source file:
  Bootstrap    -- project, QS user, 6 vendors, 3 contractors, 4 towers x 6
                  floors, 167 elements (parsed from the 4 BBS files) + their
                  bbs_plan rows (planned weight).
  A  Received  -- GRN_rebar_TESTPROJECT.xlsx, all 584 rows, per-row fidelity.
  Purchase Orders -- "Rebar vendor dump" sheet, 125 POs + line items; grn.po_id
                  linked by po_reference match (one PO, TP-PO-3400888,
                  deliberately absent -- feeds the "(unlinked)" GRN case).
  D  Issued    -- "issued to contractor" sheet, 994 real per-transaction rows
                  (contractor yard storage-location legs only, mirroring
                  load_real_sap_data_apas.py's own filter).
  B  Transferred -- "Inter transfer" sheet, 3 rows, loaded as loan-out to a
                  new "Other Sites (Test Project Aggregate)" placeholder
                  project (same pattern as the real backfill's own aggregate
                  project -- NOT the real APAS project, a distinct new row).
  E  Consumption -- NOT parsed from a file: there is no standalone JMR
                  measurement xlsx in this dataset (real APAS has JMR
                  T-3/T-4/etc; Test Project's JMR values only ever existed in
                  design2.py, feeding the Qty Backup sheets' aggregate B row).
                  Loaded here per-element, per-measurement, straight from
                  design2.py's JMR dict -- the same verified source of truth
                  that generated the Qty Backup B totals. Flagged honestly,
                  not silently substituted.
  F  WIP       -- one aggregate "WIP (stated)" element per the real backfill's
                  own pattern, bbs_plan planned_weight_kg = design2.py's
                  per-dia WIP totals, element_progress = 100%.
  I  Physical (full length) -- Annexure-1 sheet, per-contractor per-dia blocks.
  J  Physical (cut pieces)  -- Annexure-2 sheet, synthetic representative
                  2000mm batches per (contractor, dia), same approach as the
                  real backfill script.
  N  Scrap     -- "Steel Scrap-30.04.2026" sheet inside the master workbook
                  (the true loading source, per design; the separate
                  Scrap_Details.xlsx sheets are deliberately NOT loaded).

Idempotent: everything this script inserts is scoped to the Test Project's
project_id, which this script always looks up/creates by name -- a re-run
finds the same project and deletes-then-reinserts every section keyed by that
project_id, never touching any other project.

Run: venv/Scripts/python.exe scripts/load_test_project.py [--dry-run]
"""
import asyncio
import re
import sys
import uuid
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, ".")

import openpyxl  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402
from app.security import hash_password  # noqa: E402

DRY_RUN = "--dry-run" in sys.argv

TP_DIR = Path(r"D:\Abhijith P\Downloads\Apas\TestProject")
GRN_PATH = TP_DIR / "GRN_rebar_TESTPROJECT.xlsx"
SAP_DOCS_PATH = TP_DIR / "TestProject_SAP_DOCS.xlsx"
MASTER_WB_PATH = TP_DIR / "TestProject_Steel_Recon_30.04.2026.xlsx"

PROJECT_NAME = "Test Project"
OTHER_SITE_PROJECT_NAME = "Other Sites (Test Project Aggregate)"
DIAS = [8, 10, 12, 16, 20, 25, 32]
MATERIAL_CODE_TO_DIA = {
    "000000000010000160": 8, "000000000010000161": 10, "000000000010000162": 12,
    "000000000010000163": 16, "000000000010000341": 20, "000000000010000342": 25,
    "000000000010000662": 32,
}
UNIT_WEIGHT_KG_PER_M = {8: 0.395, 10: 0.617, 12: 0.888, 16: 1.578,
                        20: 2.466, 25: 3.853, 32: 6.313}
CUT_PIECE_LENGTH_MM = 2000

# design2.py's own contractor codes/names, towers, floors -- imported so the
# element/tower/floor structure this script creates matches the BBS files
# byte-for-byte (same names), without re-deriving them by parsing filenames.
sys.path.insert(0, str(Path(r"C:\Users\abhijith.p\AppData\Local\Temp\claude\d--Abhijith-P-Downloads-Apas"
                            r"\c25255fd-768e-4bae-9032-a6dc8d9508bd\scratchpad\testproject_gen")))
import design2 as D  # noqa: E402

ELEMENT_TYPE_MAP = {"column": "column", "slab": "slab", "shear wall": "shear_wall", "beam": "beam"}


def _dia_from_material_desc(desc: str) -> int | None:
    m = re.search(r"(\d+)\s*mm", desc or "", re.IGNORECASE)
    return int(m.group(1)) if m and int(m.group(1)) in DIAS else None


def _as_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


# ---------------------------------------------------------------------------
# Parsers -- read the actual generated xlsx files, not design2.py's state
# ---------------------------------------------------------------------------

def parse_grn_rows() -> list[dict]:
    wb = openpyxl.load_workbook(GRN_PATH, data_only=True, read_only=True)
    ws = wb["Sheet1"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {name: i for i, name in enumerate(header)}
    out = []
    for row in rows:
        dia = _dia_from_material_desc(row[col["Material Description"]])
        if dia is None:
            continue
        out.append({
            "dia": dia,
            "vendor_name": row[col["Vendor Name"]],
            "po_reference": row[col["Purchase order"]],
            "quantity_kg": Decimal(str(row[col["Quantity"]])) * 1000,  # source is MT
            "posting_date": _as_date(row[col["Posting Date"]]),
        })
    return out


def parse_purchase_orders() -> dict:
    wb = openpyxl.load_workbook(SAP_DOCS_PATH, data_only=True, read_only=True)
    ws = wb["Rebar vendor dump"]
    rows = ws.iter_rows(min_row=2, values_only=True)
    po_lines = defaultdict(list)
    po_vendor = {}
    po_min_date = {}
    for r in rows:
        po_number = str(r[13]).strip() if r[13] else None
        if not po_number:
            continue
        vendor_raw = str(r[1])
        vendor_name = vendor_raw.split(None, 1)[1].strip() if len(vendor_raw.split(None, 1)) == 2 else vendor_raw
        dia = MATERIAL_CODE_TO_DIA.get(str(r[2]))
        qty_mt = r[5]
        if dia is None or not qty_mt:
            continue
        po_lines[po_number].append((dia, Decimal(str(qty_mt)) * 1000))
        po_vendor[po_number] = vendor_name
        d = _as_date(r[30])
        if d and (po_number not in po_min_date or d < po_min_date[po_number]):
            po_min_date[po_number] = d
    return {"lines": po_lines, "vendor": po_vendor, "order_date": po_min_date}


def parse_store_issues() -> list[dict]:
    """Mirrors load_real_sap_data_apas.py's replace_store_issue: only the
    contractor-yard storage-location legs (never the central-store 0010 leg,
    which is the same transaction's other half and would double-count)."""
    wb = openpyxl.load_workbook(SAP_DOCS_PATH, data_only=True, read_only=True)
    ws = wb["issued to contractor"]
    yard_loc_to_code = {f"10{i+1}0": code for i, (code, _n) in enumerate(D.CONTRACTORS)}
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        storloc = r[9]
        code = yard_loc_to_code.get(storloc)
        if code is None:
            continue
        qty_mt = r[13]
        if qty_mt is None or qty_mt == 0:
            continue
        dia = _dia_from_material_desc(r[11])
        if dia is None:
            continue
        eff_date = _as_date(r[8])
        direction = "out" if qty_mt > 0 else "in"
        out.append({
            "contractor_code": code, "dia": dia,
            "quantity_kg": abs(Decimal(str(qty_mt))) * 1000,
            "direction": direction, "effective_date": eff_date,
        })
    return out


def parse_inter_transfers() -> list[dict]:
    wb = openpyxl.load_workbook(SAP_DOCS_PATH, data_only=True, read_only=True)
    ws = wb["Inter transfer"]
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        dia = _dia_from_material_desc(r[11])
        qty_mt = r[13]
        if dia is None or qty_mt is None:
            continue
        out.append({
            "dia": dia, "quantity_kg": abs(Decimal(str(qty_mt))) * 1000,
            "effective_date": _as_date(r[8]),
        })
    return out


MONTHLY_SNAPSHOTS_PATH = TP_DIR / "TestProject_Monthly_Site_Snapshots.xlsx"


def parse_monthly_snapshots(contractor_names: dict[str, str]) -> dict:
    """Reads all 16 monthly sheets: per-contractor full-length + cut-piece
    physical stock, and a per-dia WIP % assessment. Walks each sheet
    sequentially, tracking which of the three stacked sections (full-length /
    cut-piece / WIP) the current row belongs to via its own marker rows."""
    wb = openpyxl.load_workbook(MONTHLY_SNAPSHOTS_PATH, data_only=True, read_only=True)
    dia_re = re.compile(r"^\s*(\d+)\s*mm\s*$", re.IGNORECASE)
    name_to_code = {v: k for k, v in contractor_names.items()}
    out = {}
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        year, month = (int(x) for x in sheet_name.split("-"))
        section = None
        current_code = None
        snapshot_date = None
        physical: list[dict] = []
        cut_piece: list[dict] = []
        wip: dict[int, float] = {}
        for row in ws.iter_rows(values_only=True):
            c0 = row[0]
            if isinstance(c0, str) and c0.strip().lower() == "stock date:":
                d = row[3] if len(row) > 3 and row[3] else row[1]
                if isinstance(d, str):
                    snapshot_date = datetime.strptime(d.strip(), "%d.%m.%Y").date()
                continue
            if isinstance(c0, str) and "physical stock full length" in c0.lower():
                section = "full"
                continue
            if isinstance(c0, str) and "physical stock cut pieces" in c0.lower():
                section = "cut"
                continue
            if isinstance(c0, str) and c0.lower().startswith("wip assessment"):
                section = "wip"
                continue
            if isinstance(c0, str) and c0.strip().lower().startswith("contractor name"):
                current_code = name_to_code.get(c0.split(":", 1)[-1].strip())
                continue
            if section == "full" and isinstance(row[1], str):
                m = dia_re.match(row[1])
                # Include zero-value rows too (row[8] is not None, not a
                # truthy check) -- an earlier version required a truthy
                # total, which skipped legitimate zero months. The app's
                # physical-stock query takes the LATEST row PER CONTRACTOR
                # independently, so a skipped month let a contractor's stale
                # earlier count silently carry forward into later months
                # where it should read zero (a real ~86 MT discrepancy this
                # caught, comparing the live app's K against the source data).
                if m and current_code and row[8] is not None:
                    physical.append({
                        "contractor_code": current_code, "dia": int(m.group(1)),
                        "bundle_count": int(row[2] or 0), "bundle_weight_kg": float(row[3] or 0) * 1000,
                    })
            elif section == "cut" and isinstance(row[1], str):
                m = dia_re.match(row[1])
                if m and current_code and row[4] is not None:
                    cut_piece.append({
                        "contractor_code": current_code, "dia": int(m.group(1)),
                        "weight_kg": float(row[4]) * 1000,
                    })
            elif section == "wip" and isinstance(c0, str):
                m = dia_re.match(c0)
                if m and row[1] is not None:
                    wip[int(m.group(1))] = float(row[1])
        out[(year, month)] = {
            "snapshot_date": snapshot_date, "physical": physical, "cut_piece": cut_piece, "wip": wip,
        }
    return out


def parse_scrap_ledger() -> list[dict]:
    wb = openpyxl.load_workbook(MASTER_WB_PATH, data_only=True, read_only=True)
    ws = wb["Steel Scrap-30.04.2026"]
    out = []
    for row in ws.iter_rows(min_row=3, values_only=True):
        if not row[0]:
            continue
        d = row[1]
        try:
            eff_date = datetime.strptime(str(d).strip(), "%d.%m.%Y").date()
        except (ValueError, AttributeError):
            eff_date = D.ABSTRACT_CUTOFF
        out.append({
            "buyer_name": str(row[5]), "weight_kg": Decimal(str(row[9])),
            "rate_per_kg": Decimal(str(row[10])), "gate_pass_no": str(row[2]) if row[2] else None,
            "effective_date": eff_date,
        })
    return out


def parse_bbs_elements() -> list[dict]:
    """Reads the 4 real BBS files back -- proves they round-trip, and gives
    (name, tower, floor, dia, planned_kg) tuples without depending on
    design2.py's element_type, which the BBS sheet doesn't carry (bar-mark
    sheets are dia-columned, not typed) -- type is looked up from design2.py
    by name afterward since the real BBS format has no type column either."""
    out = []
    elem_by_name = {e[0]: e for e in D.ELEMENTS}
    for tower in D.TOWERS:
        fname = TP_DIR / f"TestProject_BBS_{tower.replace('-', '')}.xlsx"
        wb = openpyxl.load_workbook(fname, data_only=True, read_only=True)
        ws = wb[f"{tower} BBS"[:31]]
        rows = list(ws.iter_rows(min_row=4, values_only=True))
        for row in rows:
            name = row[1]
            if not isinstance(name, str) or name not in elem_by_name:
                continue  # TOTAL row or blank
            floor = row[2]
            dia_weights = {d: row[3 + i] for i, d in enumerate(DIAS)}
            for dia, kg in dia_weights.items():
                if kg:
                    out.append({"name": name, "tower": tower, "floor": floor, "dia": dia,
                                "planned_kg": Decimal(str(kg))})
    return out


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

async def main() -> None:
    stats: dict[str, int] = {}
    engine = create_async_engine(settings.migration_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as s:
        await s.execute(text("SET app.user_role = 'admin'"))

        # ---- bootstrap: project + user (idempotent by name/username) ----
        project_id = (await s.execute(
            text("SELECT id FROM projects WHERE name = :n"), {"n": PROJECT_NAME}
        )).scalar_one_or_none()
        if project_id is None:
            project_id = (await s.execute(
                text("INSERT INTO projects (name, location, contract_wastage_pct) "
                     "VALUES (:n, :loc, :cap) RETURNING id"),
                {"n": PROJECT_NAME, "loc": "Synthetic / Proof-of-Concept", "cap": Decimal("3.00")},
            )).scalar_one()
            print(f"Created project {project_id} ({PROJECT_NAME})")
        else:
            print(f"Found existing project {project_id} ({PROJECT_NAME}) -- will replace its data")

        created_by = (await s.execute(
            text("SELECT id FROM users WHERE username = :u"), {"u": "qs_testproject"}
        )).scalar_one_or_none()
        if created_by is None:
            created_by = (await s.execute(
                text("INSERT INTO users (username, email, password_hash, full_name, role) "
                     "VALUES (:u, :e, :p, :f, 'QS') RETURNING id"),
                {"u": "qs_testproject", "e": "qs.testproject@myhome.example",
                 "p": hash_password("dev-password-123"), "f": "Test Project QS"},
            )).scalar_one()
            print(f"Created user {created_by} (qs_testproject) -- password: dev-password-123")
        assignment_exists = (await s.execute(
            text("SELECT 1 FROM project_assignments WHERE user_id = :u AND project_id = :p"),
            {"u": created_by, "p": project_id},
        )).scalar_one_or_none()
        if assignment_exists is None:
            await s.execute(
                text("INSERT INTO project_assignments (user_id, project_id, is_primary) "
                     "VALUES (:u, :p, true)"),
                {"u": created_by, "p": project_id},
            )

        # ---- idempotent wipe: every table this script writes, scoped ONLY
        # to this project_id, so a re-run replaces cleanly. Order matters
        # (children before parents / FK dependents first). ----
        # exception_log MUST be cleared before the transaction tables it
        # references -- otherwise a re-run leaves orphaned rows pointing at
        # deleted grn/store_issue/jmr_actual ids (caught after a real re-run:
        # 401 stale + 401 fresh = 802 rows, half of them dangling).
        await s.execute(text("DELETE FROM exception_log WHERE project_id = :pid"), {"pid": project_id})
        for tbl in ["physical_count_cut_piece"]:
            await s.execute(
                text(f"DELETE FROM {tbl} WHERE project_id = :pid"), {"pid": project_id}
            )
        for tbl in ["scrap_sale", "physical_count", "element_progress", "jmr_actual",
                    "bbs_plan", "store_issue", "inter_site_transfer", "purchase_order_line"]:
            await s.execute(text(f"DELETE FROM {tbl} WHERE project_id = :pid"), {"pid": project_id})
        await s.execute(text("UPDATE grn SET po_id = NULL WHERE project_id = :pid"), {"pid": project_id})
        for tbl in ["purchase_order", "grn", "elements", "floors", "towers"]:
            await s.execute(text(f"DELETE FROM {tbl} WHERE project_id = :pid"), {"pid": project_id})
        print("Cleared any prior Test Project data (scoped strictly to this project_id)")

        dia_ids = {
            int(r.diameter_mm): r.id for r in (
                await s.execute(text("SELECT id, diameter_mm FROM dia_grades WHERE grade = 'Fe550'"))
            ).fetchall()
        }
        missing = [d for d in DIAS if d not in dia_ids]
        if missing:
            raise SystemExit(f"Missing dia_grades for {missing} -- run against a DB that already has APAS's Fe550 grades")

        async def get_or_create_vendor(name: str):
            row = (await s.execute(text("SELECT id FROM vendors WHERE name = :n"), {"n": name})).scalar_one_or_none()
            if row is None:
                row = (await s.execute(
                    text("INSERT INTO vendors (name) VALUES (:n) RETURNING id"), {"n": name}
                )).scalar_one()
            return row

        async def get_or_create_contractor(code: str, name: str):
            row = (await s.execute(
                text("SELECT id FROM contractors WHERE code = :c"), {"c": code}
            )).scalar_one_or_none()
            if row is None:
                row = (await s.execute(
                    text("INSERT INTO contractors (code, name) VALUES (:c, :n) RETURNING id"),
                    {"c": code, "n": name},
                )).scalar_one()
            return row

        vendor_ids = {v: await get_or_create_vendor(v) for v in D.VENDORS}
        contractor_ids = {code: await get_or_create_contractor(code, name) for code, name in D.CONTRACTORS}
        contractor_names = dict(D.CONTRACTORS)

        # ---- Other Sites aggregate project (distinct from APAS, mirrors the
        # real backfill's own pattern for inter_site_transfer's counterpart) ----
        other_site_id = (await s.execute(
            text("SELECT id FROM projects WHERE name = :n"), {"n": OTHER_SITE_PROJECT_NAME}
        )).scalar_one_or_none()
        if other_site_id is None:
            other_site_id = (await s.execute(
                text("INSERT INTO projects (name, location, status) VALUES (:n, 'Various', 'active') RETURNING id"),
                {"n": OTHER_SITE_PROJECT_NAME},
            )).scalar_one()

        # ---- towers + floors ----
        tower_ids: dict[str, uuid.UUID] = {}
        floor_ids: dict[tuple, uuid.UUID] = {}
        for ti, tower in enumerate(D.TOWERS):
            tid = (await s.execute(
                text("INSERT INTO towers (project_id, name, sequence) VALUES (:p, :n, :seq) RETURNING id"),
                {"p": project_id, "n": tower, "seq": ti},
            )).scalar_one()
            tower_ids[tower] = tid
            for fi, floor in enumerate(D.FLOORS):
                fid = (await s.execute(
                    text("INSERT INTO floors (tower_id, project_id, level_name, sequence) "
                         "VALUES (:t, :p, :n, :seq) RETURNING id"),
                    {"t": tid, "p": project_id, "n": floor, "seq": fi},
                )).scalar_one()
                floor_ids[(tower, floor)] = fid
        print(f"Created {len(tower_ids)} towers, {len(floor_ids)} floors")

        # ---- elements + BBS plan (parsed back from the real BBS files) ----
        bbs_rows = parse_bbs_elements()
        elem_by_name = {e[0]: e for e in D.ELEMENTS}
        element_ids: dict[str, uuid.UUID] = {}
        inserted_bbs = 0
        for row in bbs_rows:
            name = row["name"]
            if name not in element_ids:
                design_elem = elem_by_name[name]
                etype = ELEMENT_TYPE_MAP[design_elem[3]]
                tid = tower_ids[row["tower"]]
                fid = floor_ids[(row["tower"], row["floor"])]
                eid = (await s.execute(
                    text("INSERT INTO elements (tower_id, floor_id, project_id, element_type, name) "
                         "VALUES (:t, :f, :p, :et, :n) RETURNING id"),
                    {"t": tid, "f": fid, "p": project_id, "et": etype, "n": name},
                )).scalar_one()
                element_ids[name] = eid
            await s.execute(
                text("INSERT INTO bbs_plan (project_id, tower_id, floor_id, element_id, dia_grade_id, "
                     "planned_weight_kg, source_file, backfill_run_id, created_by) "
                     "VALUES (:p, :t, :f, :e, :dia, :kg, :src, :tag, :cb)"),
                {"p": project_id, "t": tower_ids[row["tower"]], "f": floor_ids[(row["tower"], row["floor"])],
                 "e": element_ids[name], "dia": dia_ids[row["dia"]], "kg": row["planned_kg"],
                 "src": f"TestProject_BBS_{row['tower'].replace('-', '')}.xlsx",
                 "tag": "test-project-v1", "cb": created_by},
            )
            inserted_bbs += 1
        print(f"Section BBS: {len(element_ids)} elements, {inserted_bbs} bbs_plan rows (parsed from the 4 real BBS files)")

        # ================= Section A: GRN =================
        grn_rows = parse_grn_rows()
        grn_id_by_ref_dia: dict = defaultdict(list)  # (po_reference, dia) -> [grn.id]
        inserted_a = 0
        for row in grn_rows:
            gate_dt = datetime.combine(row["posting_date"], datetime.min.time())
            grn_id = (await s.execute(
                text("INSERT INTO grn (project_id, vendor_id, dia_grade_id, po_reference, "
                     "weighbridge_weight_kg, receipt_type, gate_entry_at, effective_date, "
                     "notes, created_by) VALUES (:pid, :vid, :dia, :po, :qty, 'against_po', "
                     ":gate, :eff, :tag, :uid) RETURNING id"),
                {"pid": project_id, "vid": vendor_ids[row["vendor_name"]], "dia": dia_ids[row["dia"]],
                 "po": row["po_reference"], "qty": row["quantity_kg"], "gate": gate_dt,
                 "eff": row["posting_date"], "tag": "test-project-v1", "uid": created_by},
            )).scalar_one()
            grn_id_by_ref_dia[(row["po_reference"], row["dia"])].append(grn_id)
            inserted_a += 1
        print(f"Section A: inserted {inserted_a} GRN rows (parsed from GRN_rebar_TESTPROJECT.xlsx)")

        # ================= Purchase Orders + GRN linking =================
        po_data = parse_purchase_orders()
        po_ids: dict[str, uuid.UUID] = {}
        po_line_ids: dict[tuple, uuid.UUID] = {}  # (po_number, dia) -> line id
        inserted_po = inserted_lines = 0
        for po_number, lines in po_data["lines"].items():
            vendor_name = po_data["vendor"][po_number]
            order_date = po_data["order_date"].get(po_number) or D.PROJECT_START
            po_id = (await s.execute(
                text("INSERT INTO purchase_order (project_id, po_number, vendor_id, order_date, "
                     "status, created_by) VALUES (:p, :pon, :v, :od, 'closed', :cb) RETURNING id"),
                {"p": project_id, "pon": po_number, "v": vendor_ids[vendor_name], "od": order_date, "cb": created_by},
            )).scalar_one()
            po_ids[po_number] = po_id
            inserted_po += 1
            for dia, qty_kg in lines:
                line_id = (await s.execute(
                    text("INSERT INTO purchase_order_line (project_id, po_id, dia_grade_id, ordered_qty_kg) "
                         "VALUES (:p, :po, :dia, :qty) RETURNING id"),
                    {"p": project_id, "po": po_id, "dia": dia_ids[dia], "qty": qty_kg},
                )).scalar_one()
                po_line_ids[(po_number, dia)] = line_id
                inserted_lines += 1
        linked = (await s.execute(
            text("UPDATE grn SET po_id = po.id FROM purchase_order po "
                 "WHERE grn.project_id = :pid AND po.project_id = :pid "
                 "AND grn.po_reference = po.po_number AND grn.po_id IS NULL RETURNING grn.id"),
            {"pid": project_id},
        )).fetchall()
        unlinked = (await s.execute(
            text("SELECT count(*) FROM grn WHERE project_id = :pid AND po_id IS NULL"), {"pid": project_id}
        )).scalar_one()
        print(f"Purchase Orders: {inserted_po} POs, {inserted_lines} lines; "
              f"linked {len(linked)} GRN rows, {unlinked} remain unlinked (expected: the deliberate "
              f"unlinked-PO case)")

        # ================= Section D: store_issue =================
        issue_rows = parse_store_issues()
        aggregate_floor_by_contractor: dict[str, tuple] = {}

        async def get_or_create_aggregate_location(contractor_code: str):
            if contractor_code in aggregate_floor_by_contractor:
                return aggregate_floor_by_contractor[contractor_code]
            tid = (await s.execute(
                text("INSERT INTO towers (project_id, name) VALUES (:p, :n) RETURNING id"),
                {"p": project_id, "n": f"{contractor_code} Aggregate"},
            )).scalar_one()
            fid = (await s.execute(
                text("INSERT INTO floors (tower_id, project_id, level_name) VALUES (:t, :p, 'ALL') RETURNING id"),
                {"t": tid, "p": project_id},
            )).scalar_one()
            aggregate_floor_by_contractor[contractor_code] = (tid, fid)
            return tid, fid

        inserted_d = 0
        for row in issue_rows:
            cid = contractor_ids[row["contractor_code"]]
            await s.execute(
                text("INSERT INTO store_issue (project_id, contractor_id, dia_grade_id, quantity_kg, "
                     "direction, effective_date, issuing_staff, created_by) "
                     "VALUES (:p, :c, :dia, :qty, :dirn, :eff, :tag, :cb)"),
                {"p": project_id, "c": cid, "dia": dia_ids[row["dia"]], "qty": row["quantity_kg"],
                 "dirn": row["direction"], "eff": row["effective_date"], "tag": "test-project-v1", "cb": created_by},
            )
            inserted_d += 1
        print(f"Section D: inserted {inserted_d} store_issue rows (parsed from 'issued to contractor')")

        # ================= Section B: inter_site_transfer =================
        transfer_rows = parse_inter_transfers()
        inserted_b = 0
        for row in transfer_rows:
            await s.execute(
                text("INSERT INTO inter_site_transfer (project_id, from_project_id, to_project_id, "
                     "dia_grade_id, quantity_kg, flag, record_source, effective_date, "
                     "ho_approval_ref, created_by) VALUES (:p, :p, :top, :dia, :qty, 'loan', 'sap', "
                     ":eff, :tag, :cb)"),
                {"p": project_id, "top": other_site_id, "dia": dia_ids[row["dia"]], "qty": row["quantity_kg"],
                 "eff": row["effective_date"], "tag": "test-project-v1", "cb": created_by},
            )
            inserted_b += 1
        print(f"Section B: inserted {inserted_b} inter_site_transfer rows (parsed from 'Inter transfer')")

        # ================= Section E: JMR (from design2.py -- see module
        # docstring: no standalone JMR xlsx exists for this dataset) =========
        inserted_e = 0
        for name, entries in D.JMR.items():
            design_elem = elem_by_name[name]
            tower, dia = design_elem[1], design_elem[4]
            code = D.contractor_of(name)
            cid = contractor_ids[code]
            eid = element_ids.get(name)
            # tower/floor come from the element itself
            tid = tower_ids[tower]
            floor_name = design_elem[2]
            fid = floor_ids[(tower, floor_name)]
            for kg, dt in entries:
                await s.execute(
                    text("INSERT INTO jmr_actual (project_id, tower_id, floor_id, element_id, dia_grade_id, "
                         "measured_weight_kg, contractor_id, pour_number, drawing_ref, effective_date, "
                         "corrected_from_id, created_by) VALUES (:p, :t, :f, :e, :dia, :kg, :c, 'JMR-1', "
                         ":tag, :eff, :corr, :cb)"),
                    {"p": project_id, "t": tid, "f": fid, "e": eid, "dia": dia_ids[dia], "kg": Decimal(str(kg)),
                     "c": cid, "tag": "test-project-v1", "eff": dt,
                     # the deliberate duplicate row is a SEPARATE, unlinked entry
                     # (no corrected_from_id) -- design2.py's own comment confirms
                     # this is the intended duplicate_pour_entry trigger, not a
                     # real correction chain.
                     "corr": None, "cb": created_by},
                )
                inserted_e += 1
        print(f"Section E: inserted {inserted_e} jmr_actual rows (source: design2.py's JMR dict -- "
              f"no standalone JMR measurement xlsx exists in this dataset, see script docstring)")

        # ================= Section F: WIP -- one real monthly assessment per
        # dia, not a single stated total (see design2.py's MONTHLY SNAPSHOT
        # SERIES docstring for why the single-snapshot version made every
        # earlier month's F -- and therefore M -- meaningless). One element
        # per dia (bbs_plan.planned_weight_kg = that dia's FINAL F total),
        # with one element_progress row per month whose completion_pct,
        # applied to that planned total, reproduces that month's real
        # cumulative F exactly. =================
        wip_tower_id = (await s.execute(
            text("INSERT INTO towers (project_id, name) VALUES (:p, 'WIP Aggregate') RETURNING id"),
            {"p": project_id},
        )).scalar_one()
        wip_floor_id = (await s.execute(
            text("INSERT INTO floors (tower_id, project_id, level_name) VALUES (:t, :p, 'ALL') RETURNING id"),
            {"t": wip_tower_id, "p": project_id},
        )).scalar_one()

        monthly = parse_monthly_snapshots(contractor_names)

        wip_element_by_dia: dict[int, uuid.UUID] = {}
        inserted_f = 0
        for dia in DIAS:
            kg = D._f_by_dia.get(dia, 0)
            if kg <= 0:
                continue
            eid = (await s.execute(
                text("INSERT INTO elements (tower_id, floor_id, project_id, element_type, name) "
                     "VALUES (:t, :f, :p, 'misc', :n) RETURNING id"),
                {"t": wip_tower_id, "f": wip_floor_id, "p": project_id, "n": f"WIP (stated) - {dia}mm"},
            )).scalar_one()
            wip_element_by_dia[dia] = eid
            await s.execute(
                text("INSERT INTO bbs_plan (project_id, tower_id, floor_id, element_id, dia_grade_id, "
                     "planned_weight_kg, pour_description, source_file, backfill_run_id, created_by) "
                     "VALUES (:p, :t, :f, :e, :dia, :kg, 'Stated WIP', 'WIP-monthly-test-project', "
                     ":tag, :cb)"),
                {"p": project_id, "t": wip_tower_id, "f": wip_floor_id, "e": eid,
                 "dia": dia_ids[dia], "kg": Decimal(str(kg)), "tag": "test-project-v1", "cb": created_by},
            )
            for (year, month), data in monthly.items():
                pct = data["wip"].get(dia)
                snap_date = data["snapshot_date"]
                if pct is None or snap_date is None:
                    continue
                await s.execute(
                    text("INSERT INTO element_progress (project_id, element_id, as_of_date, "
                         "completion_pct, created_by) VALUES (:p, :e, :eff, :pct, :cb)"),
                    {"p": project_id, "e": eid, "eff": snap_date, "pct": Decimal(str(pct)), "cb": created_by},
                )
                inserted_f += 1
        print(f"Section F: inserted {len(wip_element_by_dia)} dia-specific WIP elements, "
              f"{inserted_f} monthly element_progress rows (real monthly assessment, "
              f"parsed from TestProject_Monthly_Site_Snapshots.xlsx)")

        # ================= Section I/J: physical stock -- one real monthly
        # snapshot per contractor+dia, not a single one (same reasoning
        # as Section F above). =================
        inserted_i = inserted_j = 0
        for (year, month), data in monthly.items():
            snap_date = data["snapshot_date"]
            if snap_date is None:
                continue
            physical_count_ids: dict[tuple, uuid.UUID] = {}
            for b in data["physical"]:
                cid = contractor_ids[b["contractor_code"]]
                pc_id = (await s.execute(
                    text("INSERT INTO physical_count (project_id, contractor_id, dia_grade_id, bundle_count, "
                         "each_bundle_weight_kg, effective_date, notes, created_by) "
                         "VALUES (:p, :c, :dia, :bc, :bw, :eff, :tag, :cb) RETURNING id"),
                    {"p": project_id, "c": cid, "dia": dia_ids[b["dia"]], "bc": b["bundle_count"],
                     "bw": Decimal(str(round(b["bundle_weight_kg"], 2))), "eff": snap_date,
                     "tag": "test-project-v1", "cb": created_by},
                )).scalar_one()
                physical_count_ids[(cid, b["dia"])] = pc_id
                inserted_i += 1
            for b in data["cut_piece"]:
                cid = contractor_ids[b["contractor_code"]]
                pc_id = physical_count_ids.get((cid, b["dia"]))
                if pc_id is None:
                    continue
                unit_weight = UNIT_WEIGHT_KG_PER_M[b["dia"]]
                per_piece_weight_kg = unit_weight * (CUT_PIECE_LENGTH_MM / 1000)
                nos = round(b["weight_kg"] / per_piece_weight_kg)
                if nos <= 0:
                    continue
                await s.execute(
                    text("INSERT INTO physical_count_cut_piece (physical_count_id, project_id, length_mm, "
                         "nos, weight_kg, classification) VALUES (:pcid, :p, :len, :nos, :wt, 'reusable')"),
                    {"pcid": pc_id, "p": project_id, "len": CUT_PIECE_LENGTH_MM, "nos": nos,
                     "wt": Decimal(str(round(per_piece_weight_kg, 4)))},
                )
                inserted_j += 1
        print(f"Section I: inserted {inserted_i} physical_count rows ({len(monthly)} monthly snapshots, "
              f"parsed from TestProject_Monthly_Site_Snapshots.xlsx)")
        print(f"Section J: inserted {inserted_j} cut-piece rows (same monthly snapshots)")

        # ================= Section N: scrap =================
        scrap_rows = parse_scrap_ledger()
        inserted_n = 0
        for row in scrap_rows:
            await s.execute(
                text("INSERT INTO scrap_sale (project_id, buyer_name, weight_kg, rate_per_kg, gate_pass_no, "
                     "effective_date, notes, created_by) VALUES (:p, :b, :wt, :rate, :gp, :eff, :tag, :cb)"),
                {"p": project_id, "b": row["buyer_name"], "wt": row["weight_kg"], "rate": row["rate_per_kg"],
                 "gp": row["gate_pass_no"], "eff": row["effective_date"], "tag": "test-project-v1", "cb": created_by},
            )
            inserted_n += 1
        print(f"Section N: inserted {inserted_n} scrap_sale rows (parsed from the master workbook's own "
              f"scrap sheet -- Scrap_Details.xlsx's sheets deliberately NOT loaded)")

        if DRY_RUN:
            print("\n[DRY RUN] rolling back -- nothing written")
            await s.rollback()
        else:
            await s.commit()
            print(f"\nCommitted. Test Project id = {project_id}")

    await engine.dispose()
    print("\nStats:", stats)


if __name__ == "__main__":
    asyncio.run(main())
