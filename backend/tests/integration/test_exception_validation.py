"""Resolving an exception has to be earned, not asserted.

Before this, POSTing /resolve with any reason string marked the exception
resolved -- the tool took the QS's word for it. These tests pin the four
guarantees that replaced that:

  1. "corrected" is re-checked against live data. Still failing => refused,
     and the row stays open.
  2. "corrected" that genuinely fixed the data is accepted, and recorded as
     'verified' (proven) rather than 'accepted' (taken on trust).
  3. "follow_up" needs a date, that date can't be in the past or so far out
     that it outruns the period close, and it does NOT resolve anything --
     it parks the row in 'pending', which still blocks finalize.
  4. An overdue pending row comes back as an open exception carrying a
     warning that names the date that was missed.

The overdue case backdates the due date in SQL on purpose: the service
refuses to accept a past date through the API (guarantee 3), so the only
honest way to reach "the promised day has passed" is to move the clock.
"""

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import text


async def _seed_masters(superuser_session):
    """Shared masters have unique constraints and no project scoping, so each
    call uses its own suffix (same pattern as test_issue_exceeds_stock)."""
    suffix = uuid.uuid4().hex[:8]
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    vendor_id = (
        await superuser_session.execute(
            text("INSERT INTO vendors (name) VALUES (:n) RETURNING id"), {"n": f"V{suffix}"}
        )
    ).scalar_one()
    contractor_id = (
        await superuser_session.execute(
            text("INSERT INTO contractors (code, name) VALUES (:c, :n) RETURNING id"),
            {"c": f"C-{suffix}", "n": f"Contractor {suffix}"},
        )
    ).scalar_one()
    dia_id = (
        await superuser_session.execute(
            text(
                "INSERT INTO dia_grades (diameter_mm, grade, unit_weight_kg_per_m) "
                "VALUES (16, :g, 1.58) RETURNING id"
            ),
            {"g": f"Fe500-{suffix}"},
        )
    ).scalar_one()
    await superuser_session.commit()
    return vendor_id, contractor_id, dia_id


async def _grn(app_client, auth_headers, vendor_id, dia_id, kg, when="2026-06-15T09:00:00Z"):
    resp = await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id), "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": str(kg), "receipt_type": "against_po",
            "gate_entry_at": when,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _overstock_issue(app_client, auth_headers, contractor_id, dia_id, kg, when="2026-06-16"):
    """Issue more than is in stock. In advisory mode this succeeds with a
    warning AND writes an exception_log row -- that row is what we resolve."""
    resp = await app_client.post(
        "/api/v1/store-issues",
        headers=auth_headers,
        json={
            "contractor_id": str(contractor_id), "dia_grade_id": str(dia_id),
            "quantity_kg": str(kg), "direction": "out", "effective_date": when,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _find_exception(app_client, auth_headers, rule_name):
    resp = await app_client.get("/api/v1/exceptions?status=open", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    matches = [e for e in resp.json() if e["rule_name"] == rule_name]
    assert matches, f"expected an open {rule_name} exception, got {resp.json()}"
    return matches[0]


@pytest.mark.asyncio
async def test_corrected_is_refused_while_the_rule_still_fails(
    app_client, seeded_project, auth_headers, superuser_session
):
    """The headline guarantee: claiming "corrected" without changing anything
    is rejected, and the exception is left untouched."""
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    resp = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={"resolution_type": "corrected", "resolver_name": "Ramesh Kumar", "reason": "trust me, I fixed it"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "correction_not_verified"

    # Left exactly as it was -- a refused correction must not half-resolve.
    row = (
        await superuser_session.execute(
            text(
                "SELECT status, resolution_type, resolved_at, validation_state "
                "FROM exception_log WHERE id = :id"
            ),
            {"id": exc["id"]},
        )
    ).one()
    assert row.status == "open"
    assert row.resolution_type is None
    assert row.resolved_at is None
    assert row.validation_state is None


@pytest.mark.asyncio
async def test_corrected_is_accepted_and_marked_verified_once_the_data_is_fixed(
    app_client, seeded_project, auth_headers, superuser_session
):
    """The other half of guarantee 1: a real fix passes re-checking and is
    recorded as proven, not merely trusted."""
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    # Actually fix the underlying problem: receive the steel that was missing.
    # Re-running the rule now finds enough stock to cover the flagged issue.
    await _grn(app_client, auth_headers, vendor_id, dia_id, 6000, when="2026-06-15T10:00:00Z")

    resp = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={"resolution_type": "corrected", "resolver_name": "Ramesh Kumar", "reason": "missing GRN 4471 was entered"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "resolved"
    assert body["validation_state"] == "verified"  # proven by re-running the rule
    assert body["resolved_at"] is not None


@pytest.mark.asyncio
async def test_approved_resolves_but_is_recorded_as_a_conscious_override(
    app_client, seeded_project, auth_headers, superuser_session
):
    """Approving is allowed -- a human may knowingly accept what the tool
    flagged -- but it is never recorded as 'verified'."""
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    resp = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={"resolution_type": "approved", "resolver_name": "Ramesh Kumar", "reason": "opening stock predates the system"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "resolved"
    assert resp.json()["validation_state"] == "accepted"


@pytest.mark.asyncio
async def test_approved_requires_a_reason(app_client, seeded_project, auth_headers, superuser_session):
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    resp = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={"resolution_type": "approved", "resolver_name": "Ramesh Kumar", "reason": ""},
    )
    assert resp.status_code == 422  # schema min_length=1


@pytest.mark.asyncio
async def test_follow_up_without_a_date_is_refused(
    app_client, seeded_project, auth_headers, superuser_session
):
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    resp = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={"resolution_type": "follow_up", "resolver_name": "Ramesh Kumar", "reason": "will check with the store"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "follow_up_date_required"


@pytest.mark.asyncio
async def test_follow_up_date_beyond_the_close_horizon_is_refused(
    app_client, seeded_project, auth_headers, superuser_session
):
    """A commitment can't be parked past the close it blocks. Six months out
    is not a follow-up, it's a way of never answering."""
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    far_out = date.today() + timedelta(days=180)
    resp = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={
            "resolution_type": "follow_up", "resolver_name": "Ramesh Kumar",
            "reason": "sometime next year",
            "follow_up_due_date": far_out.isoformat(),
        },
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "follow_up_date_invalid"


@pytest.mark.asyncio
async def test_follow_up_parks_as_pending_and_does_not_resolve(
    app_client, seeded_project, auth_headers, superuser_session
):
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    due = date.today() + timedelta(days=3)
    resp = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={
            "resolution_type": "follow_up", "resolver_name": "Ramesh Kumar",
            "reason": "store to confirm the physical count",
            "follow_up_due_date": due.isoformat(),
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "pending"
    assert body["resolved_at"] is None  # NOT resolved
    assert body["validation_state"] == "pending"
    assert body["follow_up_due_date"] == due.isoformat()

    # Still visible in the queue: a pending promise is not off the books.
    listed = await app_client.get("/api/v1/exceptions?status=open", headers=auth_headers)
    assert any(e["id"] == exc["id"] and e["status"] == "pending" for e in listed.json())


@pytest.mark.asyncio
async def test_overdue_follow_up_reopens_with_a_warning_naming_the_missed_date(
    app_client, seeded_project, auth_headers, superuser_session
):
    """Guarantee 4. The due date is backdated in SQL because the API
    (correctly) refuses a past date -- this simulates the day arriving."""
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    due = date.today() + timedelta(days=2)
    park = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={
            "resolution_type": "follow_up", "resolver_name": "Ramesh Kumar",
            "reason": "store to confirm",
            "follow_up_due_date": due.isoformat(),
        },
    )
    assert park.status_code == 200, park.text

    missed = date.today() - timedelta(days=1)
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    await superuser_session.execute(
        text("UPDATE exception_log SET follow_up_due_date = :d WHERE id = :id"),
        {"d": missed, "id": exc["id"]},
    )
    await superuser_session.commit()

    # Reading the list is what resurfaces it -- no scheduler required.
    listed = await app_client.get("/api/v1/exceptions?status=open", headers=auth_headers)
    assert listed.status_code == 200
    matches = [e for e in listed.json() if e["id"] == exc["id"]]
    assert matches, f"the overdue row did not resurface; queue was {listed.json()}"
    reopened = matches[0]
    assert reopened["status"] == "open"
    assert reopened["reopened_count"] == 1
    assert reopened["validation_state"] is None
    assert "[Overdue]" in reopened["message"]
    assert missed.isoformat() in reopened["message"]  # names the date that was missed


@pytest.mark.asyncio
async def test_resolving_without_a_name_is_refused_on_every_path(
    app_client, seeded_project, auth_headers, superuser_session
):
    """Site logins are shared per project ("qs_testproject"), so the account
    cannot answer "who decided this?". Every path has to be signed."""
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")
    soon = (date.today() + timedelta(days=3)).isoformat()

    for payload in (
        {"resolution_type": "approved", "reason": "fine by me"},
        {"resolution_type": "corrected", "reason": "sorted it"},
        {"resolution_type": "follow_up", "reason": "later", "follow_up_due_date": soon},
    ):
        resp = await app_client.post(
            f"/api/v1/exceptions/{exc['id']}/resolve", headers=auth_headers, json=payload
        )
        assert resp.status_code == 422, f"{payload['resolution_type']} was accepted unsigned: {resp.text}"

    # Whitespace is not a signature either.
    blank = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={"resolution_type": "approved", "resolver_name": "   ", "reason": "fine by me"},
    )
    assert blank.status_code == 422

    # ...and the row is untouched by any of those attempts.
    row = (
        await superuser_session.execute(
            text("SELECT status, resolver_name FROM exception_log WHERE id = :id"), {"id": exc["id"]}
        )
    ).one()
    assert row.status == "open"
    assert row.resolver_name is None


@pytest.mark.asyncio
async def test_signature_records_the_typed_name_and_the_session_role(
    app_client, seeded_project, auth_headers, superuser_session
):
    """The name is entered (the person changes shift to shift); the role comes
    from the authenticated session, so it cannot be overstated by the client."""
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    resp = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={
            "resolution_type": "approved",
            "resolver_name": "  Suresh Babu  ",  # trimmed on the way in
            "resolver_role": "admin",  # ignored: role is not client-supplied
            "reason": "opening stock predates the system",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["resolver_name"] == "Suresh Babu"
    assert body["resolver_role"] == "QS"  # from the token, NOT the "admin" above

    # The signature is in the audit trail too, not only on the mutable row.
    audit = (
        await superuser_session.execute(
            text(
                "SELECT after_json FROM audit_log WHERE table_name = 'exception_log' "
                "AND row_id = :id ORDER BY created_at DESC LIMIT 1"
            ),
            {"id": exc["id"]},
        )
    ).scalar_one()
    assert audit["resolver_name"] == "Suresh Babu"
    assert audit["resolver_role"] == "QS"


@pytest.mark.asyncio
async def test_overdue_warning_names_who_made_the_promise(
    app_client, seeded_project, auth_headers, superuser_session
):
    """When a commitment lapses, the person who made it is named -- that is the
    useful fact when deciding who to chase."""
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000)
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000)

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")
    due = date.today() + timedelta(days=2)
    park = await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={
            "resolution_type": "follow_up",
            "resolver_name": "Priya Nair",
            "reason": "store to confirm",
            "follow_up_due_date": due.isoformat(),
        },
    )
    assert park.status_code == 200, park.text

    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    await superuser_session.execute(
        text("UPDATE exception_log SET follow_up_due_date = :d WHERE id = :id"),
        {"d": date.today() - timedelta(days=1), "id": exc["id"]},
    )
    await superuser_session.commit()

    listed = await app_client.get("/api/v1/exceptions?status=open", headers=auth_headers)
    reopened = next(e for e in listed.json() if e["id"] == exc["id"])
    assert "committed by Priya Nair" in reopened["message"]


@pytest.mark.asyncio
async def test_finalize_is_blocked_by_open_and_by_pending_exceptions(
    app_client, seeded_project, auth_headers, superuser_session
):
    """The end of the chain the user asked for: "until its validated it
    shoudlnt get solved and the abstract shouldnt get finalized". A pending
    follow-up must block the close just as an open exception does."""
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    await _grn(app_client, auth_headers, vendor_id, dia_id, 1000, when="2026-05-15T09:00:00Z")
    await _overstock_issue(app_client, auth_headers, contractor_id, dia_id, 5000, when="2026-05-16")

    exc = await _find_exception(app_client, auth_headers, "issue_exceeds_stock")

    # Open exception -> blocked.
    blocked = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2026, "month": 5}
    )
    assert blocked.status_code == 422
    assert blocked.json()["error"]["code"] == "unanswered_exceptions"

    # Parked as a pending follow-up -> STILL blocked. A promise is not an answer.
    due = date.today() + timedelta(days=2)
    await app_client.post(
        f"/api/v1/exceptions/{exc['id']}/resolve",
        headers=auth_headers,
        json={
            "resolution_type": "follow_up", "resolver_name": "Ramesh Kumar",
            "reason": "store to confirm",
            "follow_up_due_date": due.isoformat(),
        },
    )
    still_blocked = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2026, "month": 5}
    )
    assert still_blocked.status_code == 422
    assert still_blocked.json()["error"]["code"] == "unanswered_exceptions"

    # Answer EVERY exception -- the GRN also raises an inbound_reconciliation
    # advisory (no PO/invoice linked), and the gate is deliberately all-or-
    # nothing: one unanswered row is enough to hold the close.
    remaining = await app_client.get("/api/v1/exceptions?status=open", headers=auth_headers)
    for pending in remaining.json():
        approved = await app_client.post(
            f"/api/v1/exceptions/{pending['id']}/resolve",
            headers=auth_headers,
            json={"resolution_type": "approved", "resolver_name": "Ramesh Kumar", "reason": "opening stock predates the system"},
        )
        assert approved.status_code == 200, approved.text

    finalized = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2026, "month": 5}
    )
    assert finalized.status_code == 201, finalized.text
