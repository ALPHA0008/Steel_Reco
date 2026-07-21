"""Bulk-import BBS planning workbooks into bbs_plan.

The real BBS backups (179 xlsx under the APAS folder) come in two broad
shapes, verified against samples:
  A) slab/pour format -- bar-mark rows, then a summary block: a header row of
     bare dia numbers (8 10 12 16 20 25 32) followed by one totals row in MT
     and often a second in KG (exactly 1000x the first).
  B) column/wall format -- a header row of '8mm'..'32mm' labels over per-row
     KG weights, one row per bar mark, sometimes with an embedded grand-total
     row at the bottom.

This importer walks every .xlsx, finds dia-header rows, extracts per-dia
planned totals per sheet, and writes one bbs_plan row per (file, sheet, dia)
in KG. Structure mapping is deliberately coarse for now (tower from the top
folder, floor from a level-looking path segment, one element per file+sheet)
-- the point is that planned totals exist per element+dia so the
jmr_exceeds_bbs_plan rule has ground truth; refinement can come later.

Idempotent: rows carry backfill_run_id; re-running with the same --run-id
deletes and replaces that run's rows (the model's documented replace key).

Usage:
  python scripts/import_bbs.py --root "path/to/Apas" --dry-run
  python scripts/import_bbs.py --root "path/to/Apas" --run-id apas-bbs-v1
"""

import argparse
import asyncio
import re
import sys
import warnings
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, ".")

DIAS = [8, 10, 12, 16, 20, 25, 32]
_DIA_LABEL_RE = re.compile(r"^\s*(\d+)\s*mm\s*$", re.IGNORECASE)

# IS-standard rebar unit weights (kg/m), dia^2/162 -- used only when a
# dia_grade row must be created because the DB doesn't have one yet.
UNIT_WEIGHT_KG_PER_M = {8: "0.395", 10: "0.617", 12: "0.888", 16: "1.578",
                        20: "2.466", 25: "3.853", 32: "6.313"}

ELEMENT_TYPE_KEYWORDS = [
    ("footing", "footing"), ("column", "column"), ("shear wall", "shear_wall"),
    ("core wall", "shear_wall"), ("ret wall", "retaining_wall"),
    ("retaining", "retaining_wall"), ("retaning", "retaining_wall"),
    ("staircase", "staircase"), ("stair", "staircase"), ("ramp", "ramp"),
    ("podium", "podium"), ("beam", "beam"), ("slab", "slab"), ("raft", "slab"),
]

_LEVEL_SEGMENT_RE = re.compile(r"^(B\d(-\w+)*|FDN-\w+|B\d-GF|GF-\w+)$", re.IGNORECASE)

# Reconciliation/actuals workbooks live alongside the BBS plans in the same
# folders -- they must never feed bbs_plan (their JMR/cut-length/stock sheets
# are ACTUALS; importing them as "plan" would corrupt the ground truth the
# jmr_exceeds_bbs_plan rule checks against). Files matching this are excluded
# WHOLESALE: confirmed (by reading their formulas) they contain no genuine
# bar-mark BBS content, only rollup/consumption/summary sheets.
_EXCLUDE_FILE_RE = re.compile(r"(?i)store\s*report|scrap|\bgrn\b")

# Found 2026-07-15 by tracing the master workbook's cross-file formulas
# (7,250 cells reference external workbooks, confirmed via openpyxl's
# _external_links): these "-recon"/"-RECON" named files are NOT pure actuals
# like the master reconciliation workbook -- each mixes a handful of
# reconciliation-rollup sheets (already live-pulled into the master's Qty
# Backup sheets as Consumption/WIP -- e.g. 'STEEL ABSTRACT T1' matches the
# KLC sheet's Tower-1 breakdown row-for-row after a /1000 unit conversion)
# with DOZENS of genuine bar-mark BBS sheets for sub-structure/basement work
# that the old blanket "recon" filename filter was silently excluding
# entirely. Un-excluded by name in walk_and_parse(); their rollup sheets are
# skipped via _MIXED_RECON_ROLLUP_RE below instead of the normal
# summary-sheet-wins logic, because these files have no legitimate "this
# sheet rolls up everything else in THIS file" summary -- their rollups
# either pull from OTHER files (a cross-reference, e.g. NTA-recon.xlsx's own
# 'CH (Sub and Super)' tab, verified to be Club House data, not NTA's) or are
# themselves feeding the MASTER workbook's Consumption/WIP -- not a rollup of
# this file's own bar-mark sheets, so summary-sheet-wins' "if a summary
# exists, drop the components" logic would be exactly backwards here.
_MIXED_RECON_FILES = {
    "NTA-recon.xlsx",
    "Type-1 Sub Structure-RECON.xlsx",
    "Type-2 Sub Structure-Recon.xlsx",
}

# Verified by direct inspection: 'Summary' sums the same file's FDN-B3/B3-B2/
# B2-B1/B1-Podium tabs (a rollup-of-own-sheets, unlike the pour-file ABSTRACT
# pattern below); 'Abstract' (bare) is a billing/RA-bill sheet full of #REF!
# errors, not a quantity table at all; 'CH (Sub and Super)' is Club House
# data cross-referenced into the NTA file, not NTA's own steel. 'STEEL
# ABSTRACT *' matches the Tower-N reconciliation-rollup pattern confirmed for
# T1 (an exact row-for-row match, after unit conversion, to the master's own
# Qty Backup sheet) -- assumed to generalize to the T2/T4/T6 variants seen in
# sheet-name listings but not each individually re-verified; the
# implausibility ceiling in _extract_for_header is the backstop if that
# assumption is wrong for a specific one.
_MIXED_RECON_ROLLUP_RE = re.compile(
    r"(?i)^steel abstract|^summary$|^abstract$|^ch \(sub and super\)$"
    r"|^fdn-b3$|^b3-b2$|^b2-b1$|^b1-\s*podium\s*$"
)

# A sheet named like this is the pour's own rolled-up summary of the other
# sheets in the same file -- when present, it alone is the file's plan and the
# component sheets are skipped (parsing both would double-count every bar).
# Does NOT apply to _MIXED_RECON_FILES -- see above.
_SUMMARY_SHEET_RE = re.compile(r"(?i)abstract|summary")


@dataclass
class SheetPlan:
    file: Path
    sheet: str
    dia_totals_kg: dict[int, float]
    method: str  # which extraction path produced it, for the report

    @property
    def total_kg(self) -> float:
        return sum(self.dia_totals_kg.values())


@dataclass
class ParseReport:
    parsed: list[SheetPlan] = field(default_factory=list)
    skipped: list[tuple[Path, str]] = field(default_factory=list)  # (file, reason)


def _cell_dia(value) -> int | None:
    """A cell 'is' a dia column marker if it's the bare number or 'NNmm'."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value) if value in DIAS else None
    if isinstance(value, str):
        m = _DIA_LABEL_RE.match(value)
        if m and int(m.group(1)) in DIAS:
            return int(m.group(1))
    return None


def _find_dia_headers(rows: list[tuple]) -> list[tuple[int, dict[int, int]]]:
    """Rows where >=5 distinct dias appear -- returns (row_idx, {col: dia})."""
    headers = []
    for i, row in enumerate(rows):
        mapping: dict[int, int] = {}
        for j, cell in enumerate(row):
            dia = _cell_dia(cell)
            if dia is not None and dia not in mapping.values():
                mapping[j] = dia
        if len(mapping) >= 5:
            headers.append((i, mapping))
    return headers


def _numeric(v) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return None


def _unit_hint(rows: list[tuple], header_idx: int) -> str | None:
    """Scan text near the header for an explicit unit ('kg' or 'mt')."""
    lo = max(0, header_idx - 10)
    for row in rows[lo : header_idx + 1]:
        for cell in row:
            if isinstance(cell, str):
                low = cell.lower()
                if "kg" in low:
                    return "kg"
                if "m.t" in low or re.search(r"\bmt\b", low):
                    return "mt"
    return None


def _extract_for_header(rows: list[tuple], header_idx: int, col_dia: dict[int, int],
                        next_header_idx: int | None) -> tuple[dict[int, float], str] | None:
    """Per-dia totals for one header block. Returns (totals_kg, method)."""
    end = next_header_idx if next_header_idx is not None else len(rows)
    data_rows: list[dict[int, float]] = []  # per row: {dia: value}
    for row in rows[header_idx + 1 : end]:
        vals: dict[int, float] = {}
        for col, dia in col_dia.items():
            if col < len(row):
                n = _numeric(row[col])
                if n is not None:
                    vals[dia] = n
        if vals:
            data_rows.append(vals)
    if not data_rows:
        return None

    def row_total(r: dict[int, float]) -> float:
        return sum(r.values())

    unit = _unit_hint(rows, header_idx)

    if len(data_rows) == 1:
        totals = data_rows[0]
        # single summary row: unit hint, else magnitude (a pour is never
        # hundreds of thousands of MT, and rarely under 1 MT... but often
        # under 1000 KG -- prefer the explicit hint whenever there is one)
        if unit == "kg" or (unit is None and row_total(totals) >= 1000):
            return totals, "single-row-kg"
        return {d: v * 1000 for d, v in totals.items()}, "single-row-mt"

    if len(data_rows) == 2:
        t0, t1 = row_total(data_rows[0]), row_total(data_rows[1])
        # MT row + KG row (KG ~ 1000x MT): take the KG one
        if t0 > 0 and 0.99 < (t1 / (t0 * 1000)) < 1.01:
            return data_rows[1], "mt+kg-pair"
        if t1 > 0 and 0.99 < (t0 / (t1 * 1000)) < 1.01:
            return data_rows[0], "mt+kg-pair"

    # many rows: check for an embedded grand-total row (one row ~= the sum of
    # all the others), else sum the columns
    grand: dict[int, float] = {}
    for r in data_rows:
        for d, v in r.items():
            grand[d] = grand.get(d, 0.0) + v
    for r in data_rows:
        rest = {d: grand.get(d, 0.0) - r.get(d, 0.0) for d in r}
        matches = sum(
            1 for d in r if rest[d] > 0 and 0.995 < (r[d] / rest[d]) < 1.005
        )
        if matches >= 2:
            totals, method = r, "embedded-total-row"
            break
    else:
        totals, method = grand, "column-sum"

    if unit == "mt":
        return {d: v * 1000 for d, v in totals.items()}, method + "-mt"
    return totals, method + "-kg"


def parse_workbook(path: Path) -> list[SheetPlan] | str:
    """All per-sheet dia totals for one workbook, or an error string."""
    import openpyxl

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001 -- corrupt/locked files are data, not bugs
        return f"unreadable: {exc}"

    plans: list[SheetPlan] = []
    try:
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = list(ws.iter_rows(values_only=True))
            headers = _find_dia_headers(rows)
            if not headers:
                continue
            # accumulate every header block on the sheet (some sheets carry
            # several pours stacked vertically)
            sheet_totals: dict[int, float] = {}
            methods: set[str] = set()
            for k, (idx, col_dia) in enumerate(headers):
                nxt = headers[k + 1][0] if k + 1 < len(headers) else None
                extracted = _extract_for_header(rows, idx, col_dia, nxt)
                if extracted is None:
                    continue
                totals, method = extracted
                methods.add(method)
                for d, v in totals.items():
                    sheet_totals[d] = sheet_totals.get(d, 0.0) + v
            total = sum(sheet_totals.values())
            if sheet_totals and total > 0:
                # sanity ceiling: one sheet of one pour file can't plausibly
                # plan more steel than a whole tower (~5,000 MT)
                if total > 5_000_000:
                    plans.append(
                        SheetPlan(path, sheet_name, {}, f"REJECTED-implausible-{total:.0f}kg")
                    )
                else:
                    plans.append(SheetPlan(path, sheet_name, sheet_totals, "+".join(sorted(methods))))
    finally:
        wb.close()
    return plans


def _guess_element_type(name: str) -> str:
    low = name.lower()
    for keyword, etype in ELEMENT_TYPE_KEYWORDS:
        if keyword in low:
            return etype
    return "misc"


def _structure_names(root: Path, file: Path) -> tuple[str, str]:
    """(tower_name, floor_name) from the path -- coarse by design."""
    rel = file.relative_to(root)
    parts = rel.parts
    tower = parts[0].strip() if len(parts) > 1 else "General"
    floor = "ALL"
    for seg in parts[1:-1]:
        # segments like 'FDN- B3' carry stray spaces -- normalize before matching
        cleaned = seg.strip().replace(" ", "")
        if _LEVEL_SEGMENT_RE.match(cleaned):
            floor = cleaned
            break
    return tower, floor


def walk_and_parse(root: Path) -> ParseReport:
    report = ParseReport()
    files = sorted(p for p in root.rglob("*.xlsx") if not p.name.startswith("~$"))
    for f in files:
        if _EXCLUDE_FILE_RE.search(f.name):
            report.skipped.append((f, "excluded: reconciliation/actuals workbook, not a BBS plan"))
            continue
        result = parse_workbook(f)
        if isinstance(result, str):
            report.skipped.append((f, result))
            continue
        if not result:
            report.skipped.append((f, "no dia-header block found"))
            continue

        good = [p for p in result if not p.method.startswith("REJECTED")]
        for plan in result:
            if plan.method.startswith("REJECTED"):
                report.skipped.append((f, f"{plan.sheet}: {plan.method}"))

        if f.name in _MIXED_RECON_FILES:
            # These files have no legitimate "rolls up my own sheets" summary
            # -- skip only the known reconciliation-rollup sheets (they feed
            # elsewhere, e.g. the master workbook's Consumption/WIP), keep
            # every genuine bar-mark component sheet independently.
            kept, dropped = [], []
            for p in good:
                (dropped if _MIXED_RECON_ROLLUP_RE.search(p.sheet) else kept).append(p)
            for p in dropped:
                report.skipped.append((f, f"{p.sheet}: reconciliation-rollup sheet, not a BBS plan"))
            good = kept
        else:
            # summary-sheet-wins: a pour file's own Abstract/Summary sheet already
            # rolls up its component sheets -- keep only the summary to avoid
            # counting every bar twice
            summaries = [p for p in good if _SUMMARY_SHEET_RE.search(p.sheet)]
            if summaries:
                for p in good:
                    if p not in summaries:
                        report.skipped.append(
                            (f, f"{p.sheet}: component sheet superseded by summary sheet")
                        )
                good = summaries
        report.parsed.extend(good)
    return report


def print_report(root: Path, report: ParseReport) -> None:
    print(f"\n{'=' * 78}\nBBS PARSE REPORT -- {root}\n{'=' * 78}")
    grand: dict[int, float] = {}
    for plan in report.parsed:
        for d, v in plan.dia_totals_kg.items():
            grand[d] = grand.get(d, 0.0) + v
        rel = plan.file.relative_to(root)
        print(f"  {str(rel)[:70]:<70} [{plan.sheet[:24]:<24}] "
              f"{plan.total_kg / 1000:>10.2f} MT  ({plan.method})")
    print(f"\nParsed {len(report.parsed)} sheet(s) across "
          f"{len({p.file for p in report.parsed})} file(s); "
          f"skipped {len(report.skipped)} file/sheet(s).")
    print("Grand totals by dia (MT): "
          + ", ".join(f"{d}mm={grand.get(d, 0.0) / 1000:.2f}" for d in DIAS))
    print(f"GRAND TOTAL: {sum(grand.values()) / 1000:.2f} MT")
    if report.skipped:
        print("\nSkipped:")
        for f, reason in report.skipped:
            print(f"  {str(f.relative_to(root))[:70]:<70} {reason[:60]}")


async def import_to_db(root: Path, report: ParseReport, run_id: str) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.config import settings

    engine = create_async_engine(settings.migration_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        await session.execute(text("SET app.user_role = 'admin'"))

        project_id = (await session.execute(
            text("SELECT id FROM projects ORDER BY created_at LIMIT 1")
        )).scalar_one_or_none()
        created_by = (await session.execute(
            text("SELECT id FROM users ORDER BY created_at LIMIT 1")
        )).scalar_one_or_none()
        if project_id is None or created_by is None:
            raise SystemExit("No project/user in DB -- run scripts/seed_dev.py first")

        # replace semantics for this run_id (the model's documented backfill key)
        deleted = (await session.execute(
            text("DELETE FROM bbs_plan WHERE backfill_run_id = :rid RETURNING id"),
            {"rid": run_id},
        )).fetchall()
        if deleted:
            print(f"Replaced {len(deleted)} existing rows for run_id={run_id}")

        # dia_grades: reuse any existing row per diameter, create if missing
        dia_ids: dict[int, object] = {}
        for d in DIAS:
            existing = (await session.execute(
                text("SELECT id FROM dia_grades WHERE diameter_mm = :d AND is_active LIMIT 1"),
                {"d": d},
            )).scalar_one_or_none()
            if existing is None:
                existing = (await session.execute(
                    text("INSERT INTO dia_grades (diameter_mm, grade, unit_weight_kg_per_m) "
                         "VALUES (:d, 'Fe500', :w) RETURNING id"),
                    {"d": d, "w": UNIT_WEIGHT_KG_PER_M[d]},
                )).scalar_one()
            dia_ids[d] = existing

        async def get_or_create(sql_find: str, sql_make: str, params: dict):
            row = (await session.execute(text(sql_find), params)).scalar_one_or_none()
            if row is None:
                row = (await session.execute(text(sql_make), params)).scalar_one()
            return row

        inserted = 0
        for plan in report.parsed:
            tower_name, floor_name = _structure_names(root, plan.file)
            element_name = f"{plan.file.stem} [{plan.sheet}]"[:255]
            tower_id = await get_or_create(
                "SELECT id FROM towers WHERE project_id = :pid AND name = :name",
                "INSERT INTO towers (project_id, name) VALUES (:pid, :name) RETURNING id",
                {"pid": project_id, "name": tower_name},
            )
            floor_id = await get_or_create(
                "SELECT id FROM floors WHERE tower_id = :tid AND level_name = :level",
                "INSERT INTO floors (tower_id, project_id, level_name) "
                "VALUES (:tid, :pid, :level) RETURNING id",
                {"tid": tower_id, "pid": project_id, "level": floor_name},
            )
            element_id = await get_or_create(
                "SELECT id FROM elements WHERE floor_id = :fid AND element_type = :etype AND name = :name",
                "INSERT INTO elements (tower_id, floor_id, project_id, element_type, name) "
                "VALUES (:tid, :fid, :pid, :etype, :name) RETURNING id",
                {"tid": tower_id, "fid": floor_id, "pid": project_id,
                 "etype": _guess_element_type(plan.file.stem + " " + plan.sheet),
                 "name": element_name},
            )
            for d, kg in plan.dia_totals_kg.items():
                if kg <= 0:
                    continue
                await session.execute(
                    text(
                        "INSERT INTO bbs_plan (project_id, tower_id, floor_id, element_id, "
                        "dia_grade_id, planned_weight_kg, pour_description, source_file, "
                        "backfill_run_id, created_by) VALUES (:pid, :tid, :fid, :eid, :dia, "
                        ":kg, :pour, :src, :rid, :uid)"
                    ),
                    {"pid": project_id, "tid": tower_id, "fid": floor_id, "eid": element_id,
                     "dia": dia_ids[d], "kg": Decimal(str(round(kg, 2))),
                     "pour": plan.sheet[:255], "src": str(plan.file.relative_to(root))[:500],
                     "rid": run_id, "uid": created_by},
                )
                inserted += 1

        await session.commit()
        print(f"\nInserted {inserted} bbs_plan rows (run_id={run_id}, project={project_id})")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Folder to walk for BBS .xlsx files")
    parser.add_argument("--dry-run", action="store_true", help="Parse and report only, no DB writes")
    parser.add_argument("--run-id", default="bbs-backfill-v1", help="Idempotent replace key")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        raise SystemExit(f"not a directory: {root}")

    report = walk_and_parse(root)
    print_report(root, report)

    if not args.dry_run:
        asyncio.run(import_to_db(root, report, args.run_id))


if __name__ == "__main__":
    main()
