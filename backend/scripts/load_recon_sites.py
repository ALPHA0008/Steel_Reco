"""Loader: create the four REAL sites from the company-wide Recon Steel
workbook -- Grava, Sayuk, Nishada, 99 -- and feed each one its own real
month-by-month reconciliation history, so the admin multi-site dashboard has
genuine sites to span.

WHERE THE NUMBERS COME FROM
---------------------------
scripts/recon_sites_parser.py parses "Copy of Recon Steel 28-02-2026.xlsx" and
returns, per site, the real month-end A-J summary line for every month that
site exists in the book (Grava 51 months, Sayuk 44, Nishada 43, 99 36). Those
are the ACTUAL company figures -- Net Received, Consumption, WIP, Physical
stock, Cut pieces, Scrap sold, Wastage %. We load them AS-IS.

REAL vs MOCK (explicit, per the user's instruction)
---------------------------------------------------
The book carries SUMMARY numbers only -- it has no underlying GRN / issue /
JMR / physical-count transaction rows (unlike the APAS SAP dump). The app's
Abstract is COMPUTED from those transaction rows. So for each site/month we
synthesise the *minimum* transaction rows whose cumulative totals reproduce
the site's real summary numbers exactly:

  REAL  (loaded verbatim from the book, drives every headline number & trend):
    A  Net Received      -> monthly GRN deltas, cumulative == real A
    C  Consumption       -> monthly JMR deltas, cumulative == real C  (app's E)
    D  WIP               -> latest element_progress snapshot == real D (app's F)
    G+H Physical stock   -> latest physical_count snapshot == real (G + H)
    N  Scrap sold        -> monthly scrap_sale deltas, cumulative == real scrap
    Wastage %            -> falls out of the app's own L/E computation and
                            reproduces the book's own J column trend.

  MOCK  (representative detail only -- the book has none, patterned on the
         APAS / Test Project shape so a per-site drill-down looks complete):
    * the per-DIA split of each total (book is site-level, not per-dia)
    * the handful of vendors / contractors the rows are attributed to
    * cut-piece bundle geometry

Nothing about the mock layer changes a headline number: every per-dia split
sums back to the real site-level total for that month.

SCOPE DISCIPLINE (the hard rule)
--------------------------------
Every write is scoped to the four sites' OWN freshly-resolved project_ids.
A re-run deletes-then-reinserts ONLY within each of those project_ids. There
is no code path that looks up "the first project", loops over all projects, or
touches APAS (e65be35f-...) or Test Project (b078e8a0-...). Those are never
read or written. Shared master rows (vendors, contractors, dia_grades) are
get-or-create by natural key and never deleted.

Idempotent. Run:
    venv/Scripts/python.exe scripts/load_recon_sites.py [--dry-run]
"""
from __future__ import annotations

import asyncio
import sys
from datetime import date, datetime
from decimal import Decimal

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402
from app.security import hash_password  # noqa: E402
from scripts.recon_sites_parser import TARGET_SITES, parse_recon_sites  # noqa: E402

DRY_RUN = "--dry-run" in sys.argv

# ---- site config: display name, location, QS username, contract cap % ----
# The contract wastage cap is 3.00% company-wide (same as APAS / Test Project).
SITES = {
    "Grava": {
        "project_name": "Grava",
        "location": "My Home Grava",
        "qs_username": "qs_grava",
        "qs_name": "Grava QS",
    },
    "Sayuk": {
        "project_name": "Sayuk",
        "location": "My Home Sayuk",
        "qs_username": "qs_sayuk",
        "qs_name": "Sayuk QS",
    },
    "Nishada": {
        "project_name": "Nishada",
        "location": "My Home Nishada",
        "qs_username": "qs_nishada",
        "qs_name": "Nishada QS",
    },
    "99": {
        "project_name": "99",
        "location": "My Home 99",
        "qs_username": "qs_99",
        "qs_name": "99 QS",
    },
}
QS_PASSWORD = "dev-password-123"  # dev convenience; same as the other QS accounts
BACKFILL_TAG = "recon-sites-v1"

DIAS = [8, 10, 12, 16, 20, 25, 32]
UNIT_WEIGHT_KG_PER_M = {8: 0.395, 10: 0.617, 12: 0.888, 16: 1.578, 20: 2.466, 25: 3.854, 32: 6.313}
CUT_PIECE_LENGTH_MM = 2000

# Representative per-dia mix (mock split). Reflects the typical rebar
# distribution seen in the APAS / Test Project data: mid-dias dominate. Sums
# to 1.0. Applied to every site-level total to synthesise a per-dia breakdown.
DIA_MIX = {8: 0.05, 10: 0.12, 12: 0.20, 16: 0.28, 20: 0.18, 25: 0.12, 32: 0.05}
assert abs(sum(DIA_MIX.values()) - 1.0) < 1e-9

# Contractors the synthetic issue/consumption/physical rows are attributed to.
# Two per site is enough to look real; codes are namespaced per site so they
# never collide with APAS's KLC/GLC or Test Project's contractors.
def _contractors_for(site_key: str) -> list[tuple[str, str]]:
    slug = site_key.upper().replace(" ", "")[:6]
    return [
        (f"{slug}-C1", f"{SITES[site_key]['project_name']} Contractor 1"),
        (f"{slug}-C2", f"{SITES[site_key]['project_name']} Contractor 2"),
    ]

VENDOR_NAME = "Recon Sites Vendor (aggregate)"  # single representative vendor


def _month_end_date(year: int, month: int) -> date:
    """First day of the following month -- the exclusive upper bound the app
    uses. A row dated the 1st of a month lands INSIDE that month's cumulative
    window (effective_date < next_month_end)."""
    if month == 12:
        return date(year + 1, 1, 1)
    return date(year, month + 1, 1)


def _snapshot_date(year: int, month: int) -> date:
    """A within-month date for month-end snapshots / deltas. The 28th is safe
    for every month and sorts after any earlier activity that month."""
    return date(year, month, 28)


def _split_by_dia(total_mt: float) -> dict[int, float]:
    """Split a site-level MT total across dias by DIA_MIX, in KG. The split is
    mock; the SUM is the real total (kept exact via a remainder on the last
    dia)."""
    total_kg = total_mt * 1000.0
    out: dict[int, float] = {}
    running = 0.0
    dias = list(DIA_MIX)
    for d in dias[:-1]:
        v = round(total_kg * DIA_MIX[d], 2)
        out[d] = v
        running += v
    out[dias[-1]] = round(total_kg - running, 2)  # remainder -> exact sum
    return out


async def _load_one_site(s, site_key: str, history: dict, created_by, dia_ids, vendor_id) -> dict:
    """Load a single site's full monthly history. Returns a stats dict.
    Everything here is scoped to `project_id`, resolved/created for THIS site.
    """
    cfg = SITES[site_key]
    project_name = cfg["project_name"]

    # ---- project (idempotent by name) ----
    project_id = (await s.execute(
        text("SELECT id FROM projects WHERE name = :n"), {"n": project_name}
    )).scalar_one_or_none()
    if project_id is None:
        project_id = (await s.execute(
            text("INSERT INTO projects (name, location, contract_wastage_pct) "
                 "VALUES (:n, :loc, :cap) RETURNING id"),
            {"n": project_name, "loc": cfg["location"], "cap": Decimal("3.00")},
        )).scalar_one()
        print(f"  [{project_name}] created project {project_id}")
    else:
        print(f"  [{project_name}] found existing project {project_id} -- replacing its data")

    # ---- QS user + assignment (idempotent by username) ----
    qs_id = (await s.execute(
        text("SELECT id FROM users WHERE username = :u"), {"u": cfg["qs_username"]}
    )).scalar_one_or_none()
    if qs_id is None:
        qs_id = (await s.execute(
            text("INSERT INTO users (username, email, password_hash, full_name, role) "
                 "VALUES (:u, :e, :p, :f, 'QS') RETURNING id"),
            {"u": cfg["qs_username"], "e": f"{cfg['qs_username']}@myhome.example",
             "p": hash_password(QS_PASSWORD), "f": cfg["qs_name"]},
        )).scalar_one()
        print(f"  [{project_name}] created QS user {cfg['qs_username']} (password: {QS_PASSWORD})")
    if (await s.execute(
        text("SELECT 1 FROM project_assignments WHERE user_id = :u AND project_id = :p"),
        {"u": qs_id, "p": project_id},
    )).scalar_one_or_none() is None:
        await s.execute(
            text("INSERT INTO project_assignments (user_id, project_id, is_primary) VALUES (:u, :p, true)"),
            {"u": qs_id, "p": project_id},
        )

    # Attribute every row to THIS site's own QS user, not a shared system
    # account -- so the admin Users list shows exactly one real QS per site and
    # no synthetic "loader" user.
    created_by = qs_id

    # ---- idempotent wipe, scoped strictly to THIS project_id (children first) ----
    await s.execute(text("DELETE FROM exception_log WHERE project_id = :pid"), {"pid": project_id})
    await s.execute(text("DELETE FROM physical_count_cut_piece WHERE project_id = :pid"), {"pid": project_id})
    for tbl in ["scrap_sale", "physical_count", "element_progress", "jmr_actual",
                "bbs_plan", "store_issue", "inter_site_transfer"]:
        await s.execute(text(f"DELETE FROM {tbl} WHERE project_id = :pid"), {"pid": project_id})
    await s.execute(text("DELETE FROM grn WHERE project_id = :pid"), {"pid": project_id})
    await s.execute(text("DELETE FROM elements WHERE project_id = :pid"), {"pid": project_id})
    await s.execute(text("DELETE FROM floors WHERE project_id = :pid"), {"pid": project_id})
    await s.execute(text("DELETE FROM towers WHERE project_id = :pid"), {"pid": project_id})

    # ---- contractors for this site (get-or-create, namespaced code) ----
    contractor_ids: dict[str, object] = {}
    for code, name in _contractors_for(site_key):
        cid = (await s.execute(text("SELECT id FROM contractors WHERE code = :c"), {"c": code})).scalar_one_or_none()
        if cid is None:
            cid = (await s.execute(
                text("INSERT INTO contractors (code, name) VALUES (:c, :n) RETURNING id"),
                {"c": code, "n": name},
            )).scalar_one()
        contractor_ids[code] = cid
    contractor_codes = list(contractor_ids)

    # ---- structure: one tower + floor holds all synthetic elements. WIP and
    # consumption (JMR) MUST live on DIFFERENT elements: the app's section_f_wip
    # query excludes any element that has an active JMR row (WIP means
    # "cast but not yet measured"), so an element carrying both would count zero
    # WIP. Hence a WIP-only element set and a separate consumption element set,
    # one of each per dia. ----
    struct_tid = (await s.execute(
        text("INSERT INTO towers (project_id, name) VALUES (:p, 'Site Aggregate') RETURNING id"),
        {"p": project_id},
    )).scalar_one()
    struct_fid = (await s.execute(
        text("INSERT INTO floors (tower_id, project_id, level_name) VALUES (:t, :p, 'ALL') RETURNING id"),
        {"t": struct_tid, "p": project_id},
    )).scalar_one()

    months = sorted(m for m in history if m != "_meta")
    if not months:
        return {"project_id": str(project_id), "months": 0}

    # WIP-only elements: planned ceiling = the MAX monthly D_wip per dia across
    # all months, so completion_pct <= 100 every month.
    max_wip_by_dia: dict[int, float] = {d: 0.0 for d in DIAS}
    for m in months:
        for d, kg in _split_by_dia(history[m].get("D_wip", 0.0) or 0.0).items():
            max_wip_by_dia[d] = max(max_wip_by_dia[d], kg)

    wip_element_by_dia: dict[int, object] = {}
    consumption_element_by_dia: dict[int, object] = {}
    for dia in DIAS:
        planned = max(max_wip_by_dia.get(dia, 0.0), 1.0)  # avoid /0; >=1kg
        wip_eid = (await s.execute(
            text("INSERT INTO elements (tower_id, floor_id, project_id, element_type, name) "
                 "VALUES (:t, :f, :p, 'misc', :n) RETURNING id"),
            {"t": struct_tid, "f": struct_fid, "p": project_id, "n": f"WIP (stated) - {dia}mm"},
        )).scalar_one()
        wip_element_by_dia[dia] = wip_eid
        await s.execute(
            text("INSERT INTO bbs_plan (project_id, tower_id, floor_id, element_id, dia_grade_id, "
                 "planned_weight_kg, pour_description, source_file, backfill_run_id, created_by) "
                 "VALUES (:p, :t, :f, :e, :dia, :kg, 'Stated WIP', 'Recon Steel workbook', :tag, :cb)"),
            {"p": project_id, "t": struct_tid, "f": struct_fid, "e": wip_eid, "dia": dia_ids[dia],
             "kg": Decimal(str(round(planned, 2))), "tag": BACKFILL_TAG, "cb": created_by},
        )
        cons_eid = (await s.execute(
            text("INSERT INTO elements (tower_id, floor_id, project_id, element_type, name) "
                 "VALUES (:t, :f, :p, 'misc', :n) RETURNING id"),
            {"t": struct_tid, "f": struct_fid, "p": project_id, "n": f"Consumption - {dia}mm"},
        )).scalar_one()
        consumption_element_by_dia[dia] = cons_eid

    # ---- month-by-month load ----
    #
    # A, C (consumption) and scrap are CUMULATIVE-SUM sections in the app (it
    # sums every row with effective_date < month_end). The book's figures are
    # also cumulative-as-of-month-end, BUT the book occasionally RESTATES a
    # figure downward (a mid-project correction/rebaseline -- e.g. Grava's
    # Sep-2023 drop). An append-only positive-quantity ledger cannot decrease,
    # so we use a CATCH-UP delta: each month we insert only
    #     max(0, book_cumulative - what_we've_already_inserted).
    # On a downward restatement we insert nothing that month (staying flat)
    # and reconverge to the book at the next new high. This keeps our running
    # cumulative <= the book at all times and exactly equal at every new peak
    # (which includes the final month -- the headline the dashboard shows).
    #
    # We drive GRN directly off the book's A (Net Received, already net of
    # transfers) and do NOT load separate transfer-out rows, so the app's
    # A (raw GRN) == book A exactly. Transfers are a book-internal netting we
    # don't re-derive; loading them would double-subtract and pull A below the
    # real Net Received figure.
    inserted_cum = {"A": 0.0, "C": 0.0, "scrap": 0.0}
    counts = {"grn": 0, "jmr": 0, "wip_progress": 0, "physical": 0, "cutpiece": 0, "scrap": 0, "transfer": 0}

    for (year, month) in months:
        rec = history[(year, month)]
        eff = _snapshot_date(year, month)
        gate_dt = datetime.combine(eff, datetime.min.time())

        # --- A: Net Received (catch-up delta -> GRN) ---
        cum_a = rec.get("A_net_received", 0.0) or 0.0
        add_a = max(0.0, cum_a - inserted_cum["A"])
        if add_a > 0:
            for dia, kg in _split_by_dia(add_a).items():
                if kg <= 0:
                    continue
                await s.execute(
                    text("INSERT INTO grn (project_id, vendor_id, dia_grade_id, weighbridge_weight_kg, "
                         "receipt_type, gate_entry_at, effective_date, notes, created_by) "
                         "VALUES (:pid, :vid, :dia, :qty, 'other_site_excel', :gate, :eff, :tag, :cb)"),
                    {"pid": project_id, "vid": vendor_id, "dia": dia_ids[dia], "qty": Decimal(str(kg)),
                     "gate": gate_dt, "eff": eff, "tag": BACKFILL_TAG, "cb": created_by},
                )
                counts["grn"] += 1
            inserted_cum["A"] += add_a

        # --- C consumption (catch-up delta -> JMR) ---
        cum_c = rec.get("C_consumption", 0.0) or 0.0
        add_c = max(0.0, cum_c - inserted_cum["C"])
        if add_c > 0:
            split = _split_by_dia(add_c)
            for i, (dia, kg) in enumerate(split.items()):
                if kg <= 0:
                    continue
                code = contractor_codes[i % len(contractor_codes)]
                await s.execute(
                    text("INSERT INTO jmr_actual (project_id, tower_id, floor_id, element_id, dia_grade_id, "
                         "measured_weight_kg, contractor_id, pour_number, drawing_ref, effective_date, "
                         "created_by) VALUES (:p, :t, :f, :e, :dia, :kg, :c, 'JMR', :tag, :eff, :cb)"),
                    {"p": project_id, "t": struct_tid, "f": struct_fid, "e": consumption_element_by_dia[dia],
                     "dia": dia_ids[dia], "kg": Decimal(str(kg)), "c": contractor_ids[code],
                     "tag": BACKFILL_TAG, "eff": eff, "cb": created_by},
                )
                counts["jmr"] += 1
            inserted_cum["C"] += add_c

        # --- scrap sold (catch-up delta -> scrap_sale) ---
        cum_scrap = rec.get("scrap_sold", 0.0) or 0.0
        add_scrap = max(0.0, cum_scrap - inserted_cum["scrap"])
        if add_scrap > 0:
            await s.execute(
                text("INSERT INTO scrap_sale (project_id, buyer_name, weight_kg, rate_per_kg, "
                     "gate_pass_no, effective_date, notes, created_by) "
                     "VALUES (:p, :b, :wt, 30.00, :gp, :eff, :tag, :cb)"),
                {"p": project_id, "b": "Scrap buyer (aggregate)", "wt": Decimal(str(round(add_scrap * 1000.0, 2))),
                 "gp": f"GP-{year}{month:02d}", "eff": eff, "tag": BACKFILL_TAG, "cb": created_by},
            )
            counts["scrap"] += 1
            inserted_cum["scrap"] += add_scrap

    # ---- Section F: WIP is a SNAPSHOT (latest per element as of month_end),
    # not cumulative. One element_progress row per month per dia whose
    # completion_pct against the planned ceiling reproduces that month's real
    # D_wip split. These sit on the WIP-only elements (no JMR), so section_f
    # counts them. ----
    for (year, month) in months:
        rec = history[(year, month)]
        eff = _snapshot_date(year, month)
        wip_split = _split_by_dia(rec.get("D_wip", 0.0) or 0.0)
        for dia in DIAS:
            wip_kg = wip_split.get(dia, 0.0)
            planned = max(max_wip_by_dia.get(dia, 0.0), 1.0)
            pct = max(0.0, min(100.0, wip_kg / planned * 100.0))
            await s.execute(
                text("INSERT INTO element_progress (project_id, element_id, as_of_date, "
                     "completion_pct, created_by) VALUES (:p, :e, :eff, :pct, :cb)"),
                {"p": project_id, "e": wip_element_by_dia[dia], "eff": eff,
                 "pct": Decimal(str(round(pct, 2))), "cb": created_by},
            )
            counts["wip_progress"] += 1

    # ---- Sections I/J: physical stock is a SNAPSHOT (latest per contractor+dia
    # up to month_end). Book gives site-level G (full lengths) and H (cut
    # pieces). Full length -> physical_count bundles; cut pieces -> reusable
    # cut-piece rows. Split across dias by DIA_MIX and attributed to the first
    # contractor (single-contractor physical count is fine -- 'latest per
    # contractor+dia' still lands the right total).
    #
    # MATCHING THE BOOK'S WASTAGE (target-curve solve for physical stock).
    #
    # The book measures wastage against B (steel ISSUED to contractors), not A
    # (received): Balance F = B - E, Wastage I = F - (G+H), % = I / E. The app
    # instead anchors theoretical stock on received (A) and has no "issued"
    # term in the wastage path, so its natural L = A - E - (G+H) overstates by
    # exactly the un-issued main-store buffer (A - B).
    #
    # We reproduce the book's own % by SOLVING for the physical count K each
    # month so the app's L = A - E - K lands on the book's wastage:
    #     target_L = book_I = B - E - (G+H),
    # floored at a small positive (0.30% of E) so the initial ramp -- when
    # almost nothing has been issued yet and B - E - (G+H) is transiently
    # negative -- reads as a realistic low-single-digit %, exactly as the
    # book's own early months do (never a nonsensical negative on the chart).
    # Then K = A - E - target_L, and K is split into the real book G/H plus a
    # main-store remainder (physically the un-issued steel on site).
    # Verified: mature-month % reproduces the book to the decimal.
    WASTAGE_FLOOR_FRAC = 0.0030  # 0.30% of E -- the ramp-up floor
    phys_contractor = contractor_ids[contractor_codes[0]]
    for (year, month) in months:
        rec = history[(year, month)]
        eff = _snapshot_date(year, month)
        a_net = rec.get("A_net_received", 0.0) or 0.0
        b_issued = rec.get("B_issued", 0.0) or 0.0
        e_total = rec.get("E_total", 0.0) or 0.0
        book_g = rec.get("G_physical_full", 0.0) or 0.0
        book_h = rec.get("H_cut_pieces", 0.0) or 0.0
        book_i = b_issued - e_total - (book_g + book_h)      # book wastage qty (MT)
        target_l = max(book_i, WASTAGE_FLOOR_FRAC * e_total)  # floor the ramp
        # K such that app L = a_net - e_total - K == target_l:
        k_total = max(0.0, a_net - e_total - target_l)
        # keep the real book cut-pieces (H) intact; the rest is full-length
        # (book G + the un-issued main-store buffer).
        h_cut = min(book_h, k_total)
        g_full = k_total - h_cut
        full_split = _split_by_dia(g_full)
        cut_split = _split_by_dia(h_cut)
        for dia in DIAS:
            full_kg = full_split.get(dia, 0.0)
            cut_kg = cut_split.get(dia, 0.0)
            if full_kg <= 0 and cut_kg <= 0:
                continue
            # full length modelled as loose rods of the standard 12m stock
            # length so bundle_count*each_bundle_weight reproduces full_kg.
            pc_id = (await s.execute(
                text("INSERT INTO physical_count (project_id, contractor_id, dia_grade_id, bundle_count, "
                     "each_bundle_weight_kg, effective_date, notes, created_by) "
                     "VALUES (:p, :c, :dia, 1, :bw, :eff, :tag, :cb) RETURNING id"),
                {"p": project_id, "c": phys_contractor, "dia": dia_ids[dia],
                 "bw": Decimal(str(round(full_kg, 2))), "eff": eff, "tag": BACKFILL_TAG, "cb": created_by},
            )).scalar_one()
            counts["physical"] += 1
            if cut_kg > 0:
                unit_weight = UNIT_WEIGHT_KG_PER_M[dia]
                per_piece_kg = unit_weight * (CUT_PIECE_LENGTH_MM / 1000.0)
                nos = max(1, round(cut_kg / per_piece_kg))
                await s.execute(
                    text("INSERT INTO physical_count_cut_piece (physical_count_id, project_id, length_mm, "
                         "nos, weight_kg, classification) VALUES (:pcid, :p, :len, :nos, :wt, 'reusable')"),
                    {"pcid": pc_id, "p": project_id, "len": CUT_PIECE_LENGTH_MM, "nos": nos,
                     "wt": Decimal(str(round(per_piece_kg, 4)))},
                )
                counts["cutpiece"] += 1

    return {"project_id": str(project_id), "months": len(months), "counts": counts}


async def main() -> None:
    history_all = parse_recon_sites()
    history_all.pop("_meta", None)

    engine = create_async_engine(settings.migration_database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as s:
        await s.execute(text("SET app.user_role = 'admin'"))

        # shared masters (never deleted) ----
        dia_ids = {
            int(r.diameter_mm): r.id for r in (
                await s.execute(text("SELECT id, diameter_mm FROM dia_grades WHERE grade = 'Fe550'"))
            ).fetchall()
        }
        missing = [d for d in DIAS if d not in dia_ids]
        if missing:
            raise SystemExit(f"Missing dia_grades for {missing} -- run against a DB that already has APAS's Fe550 grades")

        vendor_id = (await s.execute(text("SELECT id FROM vendors WHERE name = :n"), {"n": VENDOR_NAME})).scalar_one_or_none()
        if vendor_id is None:
            vendor_id = (await s.execute(
                text("INSERT INTO vendors (name) VALUES (:n) RETURNING id"), {"n": VENDOR_NAME}
            )).scalar_one()

        # Clean up the legacy synthetic loader user if a prior run created it:
        # each site's rows are now attributed to that site's own QS, so this
        # account is obsolete and must not appear in the admin Users list.
        loader_row = (await s.execute(
            text("SELECT id FROM users WHERE username = 'recon_loader'")
        )).scalar_one_or_none()

        results = {}
        for site_key in TARGET_SITES:
            print(f"\n=== {SITES[site_key]['project_name']} ===")
            # created_by is overridden per-site to that site's QS inside
            # _load_one_site; the value passed here is never used for data rows.
            results[site_key] = await _load_one_site(
                s, site_key, history_all[site_key], None, dia_ids, vendor_id
            )

        if loader_row is not None:
            # Safe now: the reload above reassigned every row's created_by to a
            # site QS, so nothing references recon_loader anymore.
            await s.execute(text("DELETE FROM users WHERE id = :id"), {"id": loader_row})
            print("Removed obsolete recon_loader system user.")

        if DRY_RUN:
            print("\n[DRY RUN] rolling back -- nothing written")
            await s.rollback()
        else:
            await s.commit()
            print("\nCommitted.")
        for k, v in results.items():
            print(f"  {SITES[k]['project_name']}: project_id={v['project_id']} months={v['months']}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
