"""Automates the manual finalize/reopen/re-finalize verification (plan §12,
Phase 1d finding): double-finalize is rejected, month-lock blocks new writes,
reopen requires a reason and lifts the lock, re-finalize creates a NEW
snapshot while retaining the original and repointing the single lock row.
"""

import uuid

import pytest


async def _seed_masters(superuser_session):
    from sqlalchemy import text

    suffix = uuid.uuid4().hex[:8]
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    vendor_id = (
        await superuser_session.execute(
            text("INSERT INTO vendors (name) VALUES (:n) RETURNING id"), {"n": f"V{suffix}"}
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
    return vendor_id, dia_id


@pytest.mark.asyncio
async def test_finalize_then_double_finalize_rejected(app_client, seeded_project, auth_headers):
    r1 = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2022, "month": 1}
    )
    assert r1.status_code == 201
    snapshot_1 = r1.json()["snapshot_id"]

    r2 = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2022, "month": 1}
    )
    assert r2.status_code == 409
    assert r2.json()["error"]["code"] == "already_finalized"
    assert snapshot_1  # sanity: the first finalize did return a real snapshot id


@pytest.mark.asyncio
async def test_finalized_month_blocks_new_writes(app_client, seeded_project, auth_headers, superuser_session):
    vendor_id, dia_id = await _seed_masters(superuser_session)

    finalize_resp = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2022, "month": 2}
    )
    assert finalize_resp.status_code == 201

    grn_resp = await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id), "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "100", "receipt_type": "against_po",
            "gate_entry_at": "2022-02-15T09:00:00Z",
        },
    )
    assert grn_resp.status_code == 409
    assert grn_resp.json()["error"]["code"] == "month_locked"


@pytest.mark.asyncio
async def test_reopen_requires_nonempty_reason(app_client, seeded_project, auth_headers):
    await app_client.post("/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2022, "month": 3})

    response = await app_client.post(
        "/api/v1/month-close/reopen", headers=auth_headers, json={"year": 2022, "month": 3, "reason": ""}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_reopen_lifts_lock_and_refinalize_creates_new_snapshot_keeping_old(
    app_client, seeded_project, auth_headers, superuser_session
):
    from sqlalchemy import text

    vendor_id, dia_id = await _seed_masters(superuser_session)

    finalize_1 = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2022, "month": 4}
    )
    assert finalize_1.status_code == 201
    lock_id = finalize_1.json()["finalized_month_id"]
    snapshot_1 = finalize_1.json()["snapshot_id"]

    reopen_resp = await app_client.post(
        "/api/v1/month-close/reopen",
        headers=auth_headers,
        json={"year": 2022, "month": 4, "reason": "Found a missing GRN"},
    )
    assert reopen_resp.status_code == 204

    # Write should now succeed -- lock lifted
    grn_resp = await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id), "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "100", "receipt_type": "against_po",
            "gate_entry_at": "2022-04-15T09:00:00Z",
        },
    )
    assert grn_resp.status_code == 201

    # That GRN has no PO/invoice to reconcile against, so it raises an
    # inbound_reconciliation advisory -- and finalize now refuses while any
    # exception is unanswered. Answer it first; this test is about the
    # reopen/re-finalize snapshot lifecycle, not the exception gate (which
    # test_exception_validation covers).
    blocked = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2022, "month": 4}
    )
    assert blocked.status_code == 422
    assert blocked.json()["error"]["code"] == "unanswered_exceptions"

    open_exc = await app_client.get("/api/v1/exceptions?status=open", headers=auth_headers)
    assert open_exc.status_code == 200
    for exc in open_exc.json():
        rr = await app_client.post(
            f"/api/v1/exceptions/{exc['id']}/resolve",
            headers=auth_headers,
            json={"resolution_type": "approved", "reason": "no upstream doc for this back-dated test GRN"},
        )
        assert rr.status_code == 200, rr.text

    finalize_2 = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2022, "month": 4}
    )
    assert finalize_2.status_code == 201
    snapshot_2 = finalize_2.json()["snapshot_id"]

    # Same lock row, repointed; a genuinely new snapshot; original retained.
    assert finalize_2.json()["finalized_month_id"] == lock_id
    assert snapshot_2 != snapshot_1

    result = await superuser_session.execute(
        text("SELECT count(*) FROM monthly_abstract_snapshot WHERE id = ANY(:ids)"),
        {"ids": [snapshot_1, snapshot_2]},
    )
    assert result.scalar_one() == 2  # both snapshots still exist

    lock_result = await superuser_session.execute(
        text("SELECT current_snapshot_id, status FROM finalized_month WHERE id = :id"), {"id": lock_id}
    )
    row = lock_result.one()
    assert str(row.current_snapshot_id) == snapshot_2
    assert row.status == "locked"

