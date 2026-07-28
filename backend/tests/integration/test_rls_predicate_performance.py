"""The RLS predicate must stay hoistable, and must stay airtight.

Migration 0013 replaced `can_access_project(project_id)` in every policy with
`project_id IN (SELECT accessible_project_ids())`. The two are semantically the
same -- the function is *defined* as that expression -- but the function form
was called once per candidate row, and each call queried project_assignments
and scanned `projects`. On the real dataset one Abstract section query went from
45ms to 0.66ms.

That kind of win is invisible: nothing breaks if someone reintroduces the
per-row form, the app just quietly gets slow again, and it will not show up in
EXPLAIN unless you connect as the app role (as the owner, RLS is bypassed
entirely and the query looks fast).

So this pins both halves:
  - the predicate shape, so the optimization cannot be silently reverted, and
  - that the rewrite did not widen access, which matters far more than speed.
"""

import uuid

import pytest
from sqlalchemy import text

# Every policy that gates on project access, i.e. what migration 0013 rewrote.
_POLICY_EXPRS = """
    SELECT c.relname AS table_name,
           p.polname AS policy_name,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') AS using_expr,
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
"""


@pytest.mark.asyncio
async def test_no_policy_calls_the_predicate_per_row(superuser_session):
    """No policy may use the `can_access_project(...)` call form."""
    rows = (await superuser_session.execute(text(_POLICY_EXPRS))).mappings().all()
    assert rows, "no RLS policies found -- the schema did not build"

    offenders = [
        f"{r['table_name']}.{r['policy_name']}"
        for r in rows
        if "can_access_project" in r["using_expr"] or "can_access_project" in r["check_expr"]
    ]
    assert not offenders, (
        "These policies call can_access_project() per row, which is ~68x slower than "
        "the inlined form. Use `<column> IN (SELECT accessible_project_ids())` instead "
        f"(see migration 0013): {offenders}"
    )


@pytest.mark.asyncio
async def test_project_scoped_tables_still_gate_on_access(superuser_session):
    """The rewrite must not have dropped the check from any table. Every
    project-scoped table needs a SELECT policy that consults the accessible
    set -- a table that lost its predicate would read as "fast" while leaking
    every project's rows."""
    rows = (await superuser_session.execute(text(_POLICY_EXPRS))).mappings().all()
    gated = {
        r["table_name"]
        for r in rows
        if "accessible_project_ids" in r["using_expr"] or "accessible_project_ids" in r["check_expr"]
    }
    # Spot-check the tables holding the reconciliation ledger itself.
    for table in (
        "grn",
        "store_issue",
        "inter_site_transfer",
        "bbs_plan",
        "jmr_actual",
        "physical_count",
        "scrap_sale",
        "purchase_order",
        "exception_log",
        "monthly_abstract_snapshot",
        "finalized_month",
        "myhome_stock",
        "projects",
    ):
        assert table in gated, f"{table} has no project-access predicate on any policy"


@pytest.mark.asyncio
async def test_inlined_predicate_still_blocks_another_projects_rows(
    db_session, superuser_session, seeded_project
):
    """The security half, exercised rather than asserted from the catalogue: a
    session scoped to project A must not see project B's GRN, and must not be
    able to insert into B either."""
    from app.models.structure import Project

    # A second project this user is NOT assigned to.
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    other = Project(name=f"Other {uuid.uuid4().hex[:8]}", location="Elsewhere")
    superuser_session.add(other)
    await superuser_session.flush()

    vendor_id = (
        await superuser_session.execute(
            text("INSERT INTO vendors (name) VALUES (:n) RETURNING id"),
            {"n": f"V{uuid.uuid4().hex[:6]}"},
        )
    ).scalar_one()
    dia_id = (
        await superuser_session.execute(
            text(
                "INSERT INTO dia_grades (diameter_mm, grade, unit_weight_kg_per_m) "
                "VALUES (16, :g, 1.58) RETURNING id"
            ),
            {"g": f"Fe500-{uuid.uuid4().hex[:6]}"},
        )
    ).scalar_one()
    # A row that belongs to the OTHER project, written with RLS bypassed.
    await superuser_session.execute(
        text(
            "INSERT INTO grn (project_id, vendor_id, dia_grade_id, weighbridge_weight_kg, "
            "receipt_type, gate_entry_at, effective_date, created_by) "
            "VALUES (:pid, :v, :d, 500, 'against_po', now(), current_date, :u)"
        ),
        {
            "pid": other.id, "v": vendor_id, "d": dia_id,
            "u": seeded_project["user"].id,
        },
    )
    await superuser_session.commit()

    # Now read as the QS scoped to the seeded project only.
    user_id = seeded_project["user"].id
    await db_session.execute(
        text("SELECT set_config('app.current_user_id', :u, true)"), {"u": str(user_id)}
    )
    await db_session.execute(text("SELECT set_config('app.user_role', 'QS', true)"))

    visible = (
        await db_session.execute(
            text("SELECT count(*) FROM grn WHERE project_id = :pid"), {"pid": other.id}
        )
    ).scalar_one()
    assert visible == 0, "the inlined predicate leaked another project's rows"

    # And writing into the other project is refused.
    with pytest.raises(Exception):
        await db_session.execute(
            text(
                "INSERT INTO grn (project_id, vendor_id, dia_grade_id, weighbridge_weight_kg, "
                "receipt_type, gate_entry_at, effective_date, created_by) "
                "VALUES (:pid, :v, :d, 10, 'against_po', now(), current_date, :u)"
            ),
            {"pid": other.id, "v": vendor_id, "d": dia_id, "u": str(user_id)},
        )
    await db_session.rollback()
