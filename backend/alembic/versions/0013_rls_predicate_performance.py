"""Make the RLS predicate evaluate once per query instead of once per row.

Every policy filtered rows with `can_access_project(project_id)`. That function
is STABLE, but because it takes the row's own column as an argument the planner
has to call it for every candidate row -- and each call runs
`accessible_project_ids()`, which queries project_assignments AND unions a full
scan of `projects`. Reading 617 GRN rows meant 617 of those.

Measured on the real dataset, one Abstract section query:

    can_access_project(project_id)                 45.03 ms
    project_id IN (SELECT accessible_project_ids())  0.66 ms   (68x faster)

As the table owner (RLS bypassed) the same query runs in 0.3 ms, which is why
this never showed up in EXPLAIN during development -- the predicate was the
entire cost, and it was invisible unless you connected as the app role.

The rewrite is a pure transformation, not a relaxation:
`can_access_project(p)` is *defined* as `SELECT p IN (SELECT
accessible_project_ids())`. Inlining that same expression lets Postgres build
one hashed subplan for the query instead of a per-row function call. Both forms
return FALSE when the set is empty and NULL for a NULL column, so an unset RLS
context still fails closed exactly as before.

Policies are rewritten from the catalogue rather than relisted here, so this
transforms precisely what exists (66 policies over 24 tables) and cannot drift
from the schema or silently miss one. `can_access_project` itself is left in
place -- it is still the readable definition of the rule, and application code
and tests refer to it.

Revision ID: 0013
Revises: 0012
"""

import re

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

# can_access_project(<expr>) -> <expr> IN (SELECT accessible_project_ids())
_CALL = re.compile(r"can_access_project\(([^()]*)\)")
_INLINED = "\\1 IN (SELECT accessible_project_ids())"

# ...and back again. Matched against what pg_get_expr() actually prints, which
# is not what we wrote: Postgres normalises the subquery with an alias and extra
# whitespace, e.g.
#   (project_id IN ( SELECT accessible_project_ids() AS accessible_project_ids))
# An earlier version of this pattern omitted the alias, so downgrade() matched
# nothing and silently left every policy inlined. Both the alias and the
# surrounding parentheses are therefore optional here.
# Deliberately does NOT match the parentheses around the whole expression:
# consuming a leading "(" without its partner produced `can_access_project(id))`
# and a syntax error. Only the `<column> IN ( SELECT ... )` span is replaced,
# leaving any enclosing parens exactly where pg_get_expr put them.
_INLINE_FORM = re.compile(
    r"([A-Za-z_][A-Za-z0-9_]*)\s+IN\s+\(\s*SELECT\s+accessible_project_ids\(\)"
    r"(?:\s+AS\s+[A-Za-z_][A-Za-z0-9_]*)?\s*\)",
    re.IGNORECASE,
)

_FETCH_POLICIES = """
    SELECT c.relname AS table_name,
           p.polname AS policy_name,
           pg_get_expr(p.polqual, p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE pg_get_expr(p.polqual, p.polrelid) LIKE :pattern
       OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE :pattern
    ORDER BY c.relname, p.polname
"""


def _rewrite(direction: str) -> None:
    """Swap between the function-call form and the inlined IN-subquery form.

    Both directions are textual transforms over whatever the catalogue
    currently holds, so a policy that gained an extra condition since this
    migration was written still round-trips correctly.
    """
    from sqlalchemy import text

    bind = op.get_bind()
    pattern = "%can_access_project%" if direction == "inline" else "%accessible_project_ids%"
    rows = bind.execute(text(_FETCH_POLICIES), {"pattern": pattern}).mappings().all()

    for row in rows:
        clauses = []
        for kind, expr in (("USING", row["using_expr"]), ("WITH CHECK", row["check_expr"])):
            if not expr:
                continue
            if direction == "inline":
                new_expr = _CALL.sub(_INLINED, expr)
            else:
                new_expr = _INLINE_FORM.sub(r"can_access_project(\1)", expr)
            if new_expr == expr:
                # Nothing was rewritten. Rather than leave the policy in a state
                # the caller did not ask for, say so -- a silently-skipped
                # rewrite is how the first version of this downgrade appeared to
                # succeed while changing nothing.
                raise RuntimeError(
                    f"could not rewrite {row['table_name']}.{row['policy_name']} "
                    f"{kind} clause ({direction}): {expr!r}"
                )
            clauses.append(f"{kind} ({new_expr})")
        if clauses:
            op.execute(
                f'ALTER POLICY "{row["policy_name"]}" ON {row["table_name"]} ' + " ".join(clauses)
            )


def upgrade() -> None:
    _rewrite("inline")


def downgrade() -> None:
    _rewrite("call")
