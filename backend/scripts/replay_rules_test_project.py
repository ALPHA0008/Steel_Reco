"""Replay every store_issue / inter_site_transfer / jmr_actual / grn row
belonging to Test Project through the rules engine, in chronological order,
and persist the exceptions that would have fired at entry time.

Scope discipline: PROJECT_ID is hardcoded to Test Project's own id, passed as
a required CLI arg (no default, no "first project" lookup, no loop over all
projects) -- this script can only ever write exception_log rows tagged with
that one project_id. It has no code path that could reach APAS.

Mirrors scripts/replay_rules_apas_backfill.py's chronological-replay pattern
(stock rules: running balance per dia; JMR rules: active-set per element),
plus ONE addition APAS's replay didn't need: inbound_reconciliation, replayed
here because Test Project's GRNs ARE PO-linked (unlike the real APAS backfill,
where no PO data existed yet) -- this is what catches the deliberate PO
overage (TP-PO-3400999) and the deliberate unlinked-PO GRN rows.

Idempotent: skips any (project_id, rule_name, transaction_id) that already
has an exception_log row.

Run: venv/Scripts/python.exe scripts/replay_rules_test_project.py <project_id> [--dry-run]
"""
import asyncio
import sys
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import text

sys.path.insert(0, ".")

from app.database import async_session_factory, set_rls_context  # noqa: E402
from app.models.system import ExceptionLog  # noqa: E402
from app.rules.base import RuleContext  # noqa: E402
from app.rules.transactional.duplicate_pour_entry import DuplicatePourEntryRule  # noqa: E402
from app.rules.transactional.inbound_reconciliation import InboundReconciliationRule  # noqa: E402
from app.rules.transactional.issue_exceeds_stock import IssueExceedsStockRule  # noqa: E402
from app.rules.transactional.jmr_exceeds_bbs_plan import JmrExceedsBbsPlanRule  # noqa: E402
from app.rules.transactional.transfer_exceeds_stock import TransferExceedsStockRule  # noqa: E402

DRY_RUN = "--dry-run" in sys.argv
_args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not _args:
    raise SystemExit("Usage: replay_rules_test_project.py <project_id> [--dry-run]")
PROJECT_ID = uuid.UUID(_args[0])

_issue_rule = IssueExceedsStockRule()
_transfer_rule = TransferExceedsStockRule()
_bbs_rule = JmrExceedsBbsPlanRule()
_dup_rule = DuplicatePourEntryRule()
_inbound_rule = InboundReconciliationRule()


async def _already_logged(session, rule_name, transaction_id) -> bool:
    result = await session.execute(
        text("SELECT 1 FROM exception_log WHERE project_id = :pid AND rule_name = :rn AND transaction_id = :tid"),
        {"pid": PROJECT_ID, "rn": rule_name, "tid": transaction_id},
    )
    return result.scalar_one_or_none() is not None


async def _insert_exception(session, kwargs: dict, stats: dict):
    stats["would_insert"] += 1
    if DRY_RUN:
        print(f"  [DRY RUN] would insert: {kwargs['rule_name']} on {kwargs['transaction_id']} -- {kwargs['message']}")
        return
    session.add(ExceptionLog(**kwargs))
    stats["inserted"] += 1


async def replay_stock_rules(session, stats: dict):
    grn_rows = (await session.execute(
        text("SELECT dia_grade_id, weighbridge_weight_kg AS qty, effective_date, created_at, id "
             "FROM grn WHERE project_id = :pid"),
        {"pid": PROJECT_ID},
    )).fetchall()
    issue_rows = (await session.execute(
        text("SELECT id, dia_grade_id, quantity_kg AS qty, direction, effective_date, created_at "
             "FROM store_issue WHERE project_id = :pid"),
        {"pid": PROJECT_ID},
    )).fetchall()
    transfer_rows = (await session.execute(
        text("SELECT id, dia_grade_id, quantity_kg AS qty, flag, effective_date, created_at "
             "FROM inter_site_transfer WHERE (flag = 'loan' AND from_project_id = :pid) "
             "OR (flag = 'return' AND to_project_id = :pid)"),
        {"pid": PROJECT_ID},
    )).fetchall()

    events_by_dia: dict = defaultdict(list)
    for r in grn_rows:
        events_by_dia[r.dia_grade_id].append(((r.effective_date, r.created_at, str(r.id)), "grn", Decimal(r.qty), None, r))
    for r in issue_rows:
        delta = Decimal(r.qty) if r.direction == "in" else -Decimal(r.qty)
        check = "issue_exceeds_stock" if r.direction == "out" else None
        events_by_dia[r.dia_grade_id].append(((r.effective_date, r.created_at, str(r.id)), f"issue_{r.direction}", delta, check, r))
    for r in transfer_rows:
        delta = Decimal(r.qty) if r.flag == "return" else -Decimal(r.qty)
        check = "transfer_exceeds_stock" if r.flag == "loan" else None
        events_by_dia[r.dia_grade_id].append(((r.effective_date, r.created_at, str(r.id)), f"transfer_{r.flag}", delta, check, r))

    for dia_id, events in events_by_dia.items():
        events.sort(key=lambda e: e[0])
        balance = Decimal("0")
        for _key, kind, delta, check, row in events:
            if check == "issue_exceeds_stock":
                ctx = RuleContext(project_id=PROJECT_ID, transaction_type="store_issue", transaction_id=row.id,
                                   payload={"quantity_kg": Decimal(row.qty)}, derived={"available_qty": balance})
                result = await _issue_rule.evaluate(ctx)
                if not result.passed and not await _already_logged(session, result.rule_id, row.id):
                    await _insert_exception(session, result.to_exception_log_kwargs(ctx), stats)
            elif check == "transfer_exceeds_stock":
                ctx = RuleContext(project_id=PROJECT_ID, transaction_type="inter_site_transfer", transaction_id=row.id,
                                   payload={"quantity_kg": Decimal(row.qty), "flag": row.flag}, derived={"available_qty": balance})
                result = await _transfer_rule.evaluate(ctx)
                if not result.passed and not await _already_logged(session, result.rule_id, row.id):
                    await _insert_exception(session, result.to_exception_log_kwargs(ctx), stats)
            balance += delta


async def replay_jmr_rules(session, stats: dict):
    jmr_rows = (await session.execute(
        text("SELECT id, element_id, dia_grade_id, measured_weight_kg, corrected_from_id, "
             "effective_date, created_at FROM jmr_actual WHERE project_id = :pid"),
        {"pid": PROJECT_ID},
    )).fetchall()
    jmr_rows = sorted(jmr_rows, key=lambda r: (r.effective_date, r.created_at, str(r.id)))

    planned_cache: dict = {}

    async def planned_for(element_id, dia_id):
        key = (element_id, dia_id)
        if key not in planned_cache:
            row = (await session.execute(
                text("SELECT COALESCE(SUM(planned_weight_kg), 0) FROM bbs_plan WHERE element_id = :eid AND dia_grade_id = :dia"),
                {"eid": element_id, "dia": dia_id},
            )).scalar_one()
            planned_cache[key] = Decimal(row)
        return planned_cache[key]

    active_ids: dict = defaultdict(set)
    active_weight_by_key: dict = defaultdict(lambda: Decimal("0"))
    row_weight_by_id: dict = {}
    row_key_by_id: dict = {}

    for row in jmr_rows:
        element_id = row.element_id
        dia_id = row.dia_grade_id
        weight = Decimal(row.measured_weight_kg)
        if element_id is None:
            continue

        existing_count = len(active_ids[element_id])
        dup_ctx = RuleContext(project_id=PROJECT_ID, transaction_type="jmr_actual", transaction_id=row.id,
                               payload={"element_id": element_id, "corrected_from_id": row.corrected_from_id},
                               derived={"existing_jmr_count_for_element": existing_count})
        dup_result = await _dup_rule.evaluate(dup_ctx)
        if not dup_result.passed and not await _already_logged(session, dup_result.rule_id, row.id):
            await _insert_exception(session, dup_result.to_exception_log_kwargs(dup_ctx), stats)

        key = (element_id, dia_id)
        prior_measured = active_weight_by_key[key]
        if row.corrected_from_id is not None and row.corrected_from_id in row_weight_by_id:
            corrected_key = row_key_by_id.get(row.corrected_from_id)
            if corrected_key == key:
                prior_measured -= row_weight_by_id[row.corrected_from_id]
        cumulative = prior_measured + weight
        planned = await planned_for(element_id, dia_id)

        bbs_ctx = RuleContext(project_id=PROJECT_ID, transaction_type="jmr_actual", transaction_id=row.id,
                               payload={"element_id": element_id, "corrected_from_id": row.corrected_from_id,
                                        "measured_weight_kg": weight},
                               derived={"bbs_planned_weight_kg": planned, "cumulative_measured_weight_kg": cumulative})
        bbs_result = await _bbs_rule.evaluate(bbs_ctx)
        if not bbs_result.passed and not await _already_logged(session, bbs_result.rule_id, row.id):
            await _insert_exception(session, bbs_result.to_exception_log_kwargs(bbs_ctx), stats)

        if row.corrected_from_id is not None and row.corrected_from_id in active_ids[element_id]:
            active_ids[element_id].discard(row.corrected_from_id)
            if row_key_by_id.get(row.corrected_from_id) == key:
                active_weight_by_key[key] -= row_weight_by_id[row.corrected_from_id]
        active_ids[element_id].add(row.id)
        active_weight_by_key[key] += weight
        row_weight_by_id[row.id] = weight
        row_key_by_id[row.id] = key


async def replay_grn_rules(session, stats: dict):
    """inbound_reconciliation: chronological cumulative-accepted-vs-ordered
    per (po_id, dia), plus the no-anchor case for unlinked GRNs."""
    grn_rows = (await session.execute(
        text("SELECT id, dia_grade_id, weighbridge_weight_kg AS qty, po_id, effective_date, created_at "
             "FROM grn WHERE project_id = :pid"),
        {"pid": PROJECT_ID},
    )).fetchall()
    grn_rows = sorted(grn_rows, key=lambda r: (r.effective_date, r.created_at, str(r.id)))

    ordered_cache: dict = {}

    async def ordered_for(po_id, dia_id):
        """SUM, not a single row -- a PO can carry two lines of the same dia
        (design2.py's bundling logic occasionally pairs two same-dia chunks
        onto one PO), so assuming one row per (po,dia) undercounts."""
        key = (po_id, dia_id)
        if key not in ordered_cache:
            row = (await session.execute(
                text("SELECT COALESCE(SUM(ordered_qty_kg), 0) FROM purchase_order_line "
                     "WHERE po_id = :po AND dia_grade_id = :dia"),
                {"po": po_id, "dia": dia_id},
            )).scalar_one()
            ordered_cache[key] = Decimal(row) if row else None
        return ordered_cache[key]

    cumulative_by_po_dia: dict = defaultdict(lambda: Decimal("0"))
    for row in grn_rows:
        qty = Decimal(row.qty)
        derived = {}
        if row.po_id is not None:
            ordered = await ordered_for(row.po_id, row.dia_grade_id)
            key = (row.po_id, row.dia_grade_id)
            cumulative_by_po_dia[key] += qty
            derived = {"po_id": row.po_id, "ordered_qty_kg": ordered, "cumulative_accepted_kg": cumulative_by_po_dia[key]}
        ctx = RuleContext(project_id=PROJECT_ID, transaction_type="grn", transaction_id=row.id,
                           payload={"weighbridge_weight_kg": qty}, derived=derived)
        result = await _inbound_rule.evaluate(ctx)
        if not result.passed and not await _already_logged(session, result.rule_id, row.id):
            await _insert_exception(session, result.to_exception_log_kwargs(ctx), stats)


async def main():
    stats = {"would_insert": 0, "inserted": 0}
    async with async_session_factory() as session:
        await set_rls_context(session, user_id=None, user_role="admin")
        print(f"Replaying Test Project ({PROJECT_ID}) ONLY...")
        await replay_stock_rules(session, stats)
        await replay_jmr_rules(session, stats)
        await replay_grn_rules(session, stats)
        if not DRY_RUN:
            await session.commit()

    print(f"\nDone. {stats['would_insert']} rule failure(s) found, {stats['inserted']} new exception_log row(s) inserted"
          f"{' (dry run -- nothing written)' if DRY_RUN else ''}.")


if __name__ == "__main__":
    asyncio.run(main())
