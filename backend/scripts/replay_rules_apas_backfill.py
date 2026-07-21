"""Replay every EXISTING store_issue / inter_site_transfer / jmr_actual row
through the rules engine, in chronological order, and persist the exceptions
that would have fired at entry time.

Why this exists: the historical backfill (backfill_apas_april2026.py) inserts
rows directly with raw SQL, bypassing the service layer entirely -- so the
rules engine (issue_exceeds_stock, transfer_exceeds_stock, jmr_exceeds_bbs_plan,
duplicate_pour_entry) has never actually evaluated a single one of the ~44
historical transaction rows in this project. The Exceptions inbox only shows
smoke-test artifacts, not anything real. This script closes that gap using
data that already exists -- no new data needed.

Deliberately NOT replayed: grn/inbound_reconciliation. Every one of the 979
backfilled GRN rows has no linked PO/invoice (that data was never obtained --
see the Section A / PO-linking gaps), so replaying it would insert 979
near-identical "unreconciled" rows -- noise, not a finding. That gap is
instead made visible properly by the GRN po_reference grouping feature.

Chronological replay logic:
- Stock rules (issue_exceeds_stock, transfer_exceeds_stock): per (project,
  dia_grade_id), walk every stock-affecting event (GRN receipt, store_issue
  in/out, transfer loan/return) ordered by (effective_date, created_at, id),
  maintaining a running balance. A running balance is REQUIRED, not just the
  current total -- an issue evaluated against "final" stock would never look
  short even if it clearly outran what had arrived by that date.
- JMR rules (jmr_exceeds_bbs_plan, duplicate_pour_entry): per project, walk
  every jmr_actual row chronologically, maintaining an "active rows" set per
  element (a row leaves the active set the instant something else's
  corrected_from_id points at it) and a running active-measured-sum per
  element+dia -- mirroring jmr_actual_service's own exclude_id logic exactly.

Idempotent: skips any (project_id, rule_name, transaction_id) that already
has an exception_log row, so re-running never duplicates.

Run: venv/Scripts/python.exe scripts/replay_rules_apas_backfill.py [--dry-run]
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
from app.rules.transactional.issue_exceeds_stock import IssueExceedsStockRule  # noqa: E402
from app.rules.transactional.jmr_exceeds_bbs_plan import JmrExceedsBbsPlanRule  # noqa: E402
from app.rules.transactional.transfer_exceeds_stock import TransferExceedsStockRule  # noqa: E402

DRY_RUN = "--dry-run" in sys.argv

_issue_rule = IssueExceedsStockRule()
_transfer_rule = TransferExceedsStockRule()
_bbs_rule = JmrExceedsBbsPlanRule()
_dup_rule = DuplicatePourEntryRule()


async def _already_logged(session, project_id, rule_name, transaction_id) -> bool:
    result = await session.execute(
        text(
            "SELECT 1 FROM exception_log WHERE project_id = :pid AND rule_name = :rn "
            "AND transaction_id = :tid"
        ),
        {"pid": project_id, "rn": rule_name, "tid": transaction_id},
    )
    return result.scalar_one_or_none() is not None


async def _insert_exception(session, kwargs: dict, stats: dict):
    stats["would_insert"] += 1
    if DRY_RUN:
        print(f"  [DRY RUN] would insert: {kwargs['rule_name']} on {kwargs['transaction_id']} -- {kwargs['message']}")
        return
    session.add(ExceptionLog(**kwargs))
    stats["inserted"] += 1


async def replay_stock_rules(session, project_id: uuid.UUID, stats: dict):
    """issue_exceeds_stock + transfer_exceeds_stock, chronological running balance."""
    grn_rows = (
        await session.execute(
            text(
                "SELECT dia_grade_id, weighbridge_weight_kg AS qty, effective_date, created_at, id "
                "FROM grn WHERE project_id = :pid"
            ),
            {"pid": project_id},
        )
    ).fetchall()
    issue_rows = (
        await session.execute(
            text(
                "SELECT id, dia_grade_id, quantity_kg AS qty, direction, effective_date, created_at "
                "FROM store_issue WHERE project_id = :pid"
            ),
            {"pid": project_id},
        )
    ).fetchall()
    # Mirror StockRepository.available_qty exactly: a 'loan' only affects the
    # SENDER's balance (from_project_id), a 'return' only affects the
    # RECEIVER's balance (to_project_id) -- never both, and never the other
    # side. Fetching "from OR to" and checking every row against both
    # projects (an earlier draft of this script did that) misapplies the
    # stock check to a project that was never the sender.
    transfer_rows = (
        await session.execute(
            text(
                "SELECT id, dia_grade_id, quantity_kg AS qty, flag, effective_date, created_at "
                "FROM inter_site_transfer "
                "WHERE (flag = 'loan' AND from_project_id = :pid) "
                "   OR (flag = 'return' AND to_project_id = :pid)"
            ),
            {"pid": project_id},
        )
    ).fetchall()

    # Build a unified event stream per dia: (sort_key, kind, delta, check, row)
    events_by_dia: dict = defaultdict(list)
    for r in grn_rows:
        events_by_dia[r.dia_grade_id].append(
            ((r.effective_date, r.created_at, str(r.id)), "grn", Decimal(r.qty), None, r)
        )
    for r in issue_rows:
        delta = Decimal(r.qty) if r.direction == "in" else -Decimal(r.qty)
        check = "issue_exceeds_stock" if r.direction == "out" else None
        events_by_dia[r.dia_grade_id].append(
            ((r.effective_date, r.created_at, str(r.id)), f"issue_{r.direction}", delta, check, r)
        )
    for r in transfer_rows:
        delta = Decimal(r.qty) if r.flag == "return" else -Decimal(r.qty)
        check = "transfer_exceeds_stock" if r.flag == "loan" else None
        events_by_dia[r.dia_grade_id].append(
            ((r.effective_date, r.created_at, str(r.id)), f"transfer_{r.flag}", delta, check, r)
        )

    for dia_id, events in events_by_dia.items():
        events.sort(key=lambda e: e[0])
        balance = Decimal("0")
        for _key, kind, delta, check, row in events:
            if check == "issue_exceeds_stock":
                ctx = RuleContext(
                    project_id=project_id, transaction_type="store_issue", transaction_id=row.id,
                    payload={"quantity_kg": Decimal(row.qty)}, derived={"available_qty": balance},
                )
                result = await _issue_rule.evaluate(ctx)
                if not result.passed and not await _already_logged(session, project_id, result.rule_id, row.id):
                    await _insert_exception(session, result.to_exception_log_kwargs(ctx), stats)
            elif check == "transfer_exceeds_stock":
                ctx = RuleContext(
                    project_id=project_id, transaction_type="inter_site_transfer", transaction_id=row.id,
                    payload={"quantity_kg": Decimal(row.qty), "flag": row.flag},
                    derived={"available_qty": balance},
                )
                result = await _transfer_rule.evaluate(ctx)
                if not result.passed and not await _already_logged(session, project_id, result.rule_id, row.id):
                    await _insert_exception(session, result.to_exception_log_kwargs(ctx), stats)
            balance += delta


async def replay_jmr_rules(session, project_id: uuid.UUID, stats: dict):
    """jmr_exceeds_bbs_plan + duplicate_pour_entry, chronological active-set replay."""
    jmr_rows = (
        await session.execute(
            text(
                "SELECT id, element_id, dia_grade_id, measured_weight_kg, corrected_from_id, "
                "effective_date, created_at FROM jmr_actual WHERE project_id = :pid"
            ),
            {"pid": project_id},
        )
    ).fetchall()
    jmr_rows = sorted(jmr_rows, key=lambda r: (r.effective_date, r.created_at, str(r.id)))

    # cache total planned per (element, dia) -- doesn't change across the replay
    planned_cache: dict = {}

    async def planned_for(element_id, dia_id):
        key = (element_id, dia_id)
        if key not in planned_cache:
            row = (
                await session.execute(
                    text(
                        "SELECT COALESCE(SUM(planned_weight_kg), 0) FROM bbs_plan "
                        "WHERE element_id = :eid AND dia_grade_id = :dia"
                    ),
                    {"eid": element_id, "dia": dia_id},
                )
            ).scalar_one()
            planned_cache[key] = Decimal(row)
        return planned_cache[key]

    active_ids: dict = defaultdict(set)  # element_id -> {row_id, ...}
    active_weight_by_key: dict = defaultdict(lambda: Decimal("0"))  # (element,dia) -> sum
    row_weight_by_id: dict = {}
    row_key_by_id: dict = {}

    for row in jmr_rows:
        element_id = row.element_id
        dia_id = row.dia_grade_id
        weight = Decimal(row.measured_weight_kg)

        if element_id is not None:
            existing_count = len(active_ids[element_id])

            dup_ctx = RuleContext(
                project_id=project_id, transaction_type="jmr_actual", transaction_id=row.id,
                payload={"element_id": element_id, "corrected_from_id": row.corrected_from_id},
                derived={"existing_jmr_count_for_element": existing_count},
            )
            dup_result = await _dup_rule.evaluate(dup_ctx)
            if not dup_result.passed and not await _already_logged(session, project_id, dup_result.rule_id, row.id):
                await _insert_exception(session, dup_result.to_exception_log_kwargs(dup_ctx), stats)

            key = (element_id, dia_id)
            prior_measured = active_weight_by_key[key]
            if row.corrected_from_id is not None and row.corrected_from_id in row_weight_by_id:
                corrected_key = row_key_by_id.get(row.corrected_from_id)
                if corrected_key == key:
                    prior_measured -= row_weight_by_id[row.corrected_from_id]
            cumulative = prior_measured + weight
            planned = await planned_for(element_id, dia_id)

            bbs_ctx = RuleContext(
                project_id=project_id, transaction_type="jmr_actual", transaction_id=row.id,
                payload={"element_id": element_id, "corrected_from_id": row.corrected_from_id,
                         "measured_weight_kg": weight},
                derived={"bbs_planned_weight_kg": planned, "cumulative_measured_weight_kg": cumulative},
            )
            bbs_result = await _bbs_rule.evaluate(bbs_ctx)
            if not bbs_result.passed and not await _already_logged(session, project_id, bbs_result.rule_id, row.id):
                await _insert_exception(session, bbs_result.to_exception_log_kwargs(bbs_ctx), stats)

            # apply this row's effect on the active set/sums
            if row.corrected_from_id is not None and row.corrected_from_id in active_ids[element_id]:
                active_ids[element_id].discard(row.corrected_from_id)
                if row_key_by_id.get(row.corrected_from_id) == key:
                    active_weight_by_key[key] -= row_weight_by_id[row.corrected_from_id]
            active_ids[element_id].add(row.id)
            active_weight_by_key[key] += weight
            row_weight_by_id[row.id] = weight
            row_key_by_id[row.id] = key


async def main():
    stats = {"would_insert": 0, "inserted": 0}
    async with async_session_factory() as session:
        await set_rls_context(session, user_id=None, user_role="admin")
        project_ids = [
            r[0] for r in (await session.execute(text("SELECT id FROM projects"))).fetchall()
        ]
        for pid in project_ids:
            print(f"Replaying project {pid}...")
            await replay_stock_rules(session, pid, stats)
            await replay_jmr_rules(session, pid, stats)
        if not DRY_RUN:
            await session.commit()

    print(f"\nDone. {stats['would_insert']} rule failure(s) found across all projects, "
          f"{stats['inserted']} new exception_log row(s) inserted"
          f"{' (dry run -- nothing written)' if DRY_RUN else ''}.")


if __name__ == "__main__":
    asyncio.run(main())
