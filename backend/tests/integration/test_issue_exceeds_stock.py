"""End-to-end HTTP tests for the core invariant (plan §5.3/§12), mirroring
the manual curl verification done during implementation: advisory mode
allows an over-stock issue with a warning; blocking mode (via a
rule_thresholds row, no deploy) rejects it with zero rows written.
"""

import uuid

import pytest


async def _seed_master_data(superuser_session, project_id):
    """vendors/contractors/dia_grades are shared masters (plan §3.1, no
    project scoping) with unique constraints (contractors.code,
    dia_grades(diameter_mm, grade)) -- unique suffixes per call so
    independent tests sharing one container don't collide.
    """
    from sqlalchemy import text

    suffix = uuid.uuid4().hex[:8]
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    vendor_id = (
        await superuser_session.execute(
            text("INSERT INTO vendors (name) VALUES (:name) RETURNING id"), {"name": f"Test Vendor {suffix}"}
        )
    ).scalar_one()
    contractor_id = (
        await superuser_session.execute(
            text("INSERT INTO contractors (code, name) VALUES (:code, :name) RETURNING id"),
            {"code": f"KLC-{suffix}", "name": f"KLC Test {suffix}"},
        )
    ).scalar_one()
    dia_id = (
        await superuser_session.execute(
            text(
                "INSERT INTO dia_grades (diameter_mm, grade, unit_weight_kg_per_m) "
                "VALUES (:dia, :grade, 1.58) RETURNING id"
            ),
            {"dia": 16, "grade": f"Fe500-{suffix}"},
        )
    ).scalar_one()
    await superuser_session.commit()
    return vendor_id, contractor_id, dia_id


@pytest.mark.asyncio
async def test_advisory_mode_allows_overstock_issue_with_warning(
    app_client, seeded_project, auth_headers, superuser_session
):
    vendor_id, contractor_id, dia_id = await _seed_master_data(
        superuser_session, seeded_project["project"].id
    )

    grn_resp = await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id),
            "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "1000",
            "receipt_type": "against_po",
            "gate_entry_at": "2026-06-15T09:00:00Z",
        },
    )
    assert grn_resp.status_code == 201

    issue_resp = await app_client.post(
        "/api/v1/store-issues",
        headers=auth_headers,
        json={
            "contractor_id": str(contractor_id),
            "dia_grade_id": str(dia_id),
            "quantity_kg": "5000",
            "direction": "out",
            "effective_date": "2026-06-16",
        },
    )
    assert issue_resp.status_code == 201
    body = issue_resp.json()
    assert body["warning"] is not None
    assert "exceeds stock for this diameter" in body["warning"]


@pytest.mark.asyncio
async def test_blocking_mode_rejects_overstock_issue_with_zero_rows_written(
    app_client, seeded_project, auth_headers, superuser_session, db_session
):
    from sqlalchemy import text

    vendor_id, contractor_id, dia_id = await _seed_master_data(
        superuser_session, seeded_project["project"].id
    )

    await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id),
            "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "1000",
            "receipt_type": "against_po",
            "gate_entry_at": "2026-06-15T09:00:00Z",
        },
    )

    # Promote to blocking -- no code deploy, just a rule_thresholds row (plan §5.3).
    await superuser_session.execute(
        text(
            "INSERT INTO rule_thresholds (rule_name, project_id, threshold_key, mode) "
            "VALUES ('issue_exceeds_stock', :pid, 'mode', 'blocking')"
        ),
        {"pid": seeded_project["project"].id},
    )
    await superuser_session.commit()

    issue_resp = await app_client.post(
        "/api/v1/store-issues",
        headers=auth_headers,
        json={
            "contractor_id": str(contractor_id),
            "dia_grade_id": str(dia_id),
            "quantity_kg": "5000",
            "direction": "out",
            "effective_date": "2026-06-17",
        },
    )
    assert issue_resp.status_code == 422
    assert issue_resp.json()["error"]["code"] == "blocking_rule_violation"

    count_result = await db_session.execute(
        text("SELECT count(*) FROM store_issue WHERE quantity_kg = 5000")
    )
    assert count_result.scalar_one() == 0


@pytest.mark.asyncio
async def test_within_stock_issue_succeeds_with_no_warning(
    app_client, seeded_project, auth_headers, superuser_session
):
    vendor_id, contractor_id, dia_id = await _seed_master_data(
        superuser_session, seeded_project["project"].id
    )

    await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id),
            "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "1000",
            "receipt_type": "against_po",
            "gate_entry_at": "2026-06-15T09:00:00Z",
        },
    )

    issue_resp = await app_client.post(
        "/api/v1/store-issues",
        headers=auth_headers,
        json={
            "contractor_id": str(contractor_id),
            "dia_grade_id": str(dia_id),
            "quantity_kg": "500",
            "direction": "out",
            "effective_date": "2026-06-16",
        },
    )
    assert issue_resp.status_code == 201
    assert issue_resp.json()["warning"] is None


@pytest.mark.asyncio
async def test_earlier_issues_are_subtracted_even_with_no_returns(
    app_client, seeded_project, auth_headers, superuser_session
):
    """Regression: available_qty COALESCEd the whole issues term instead of
    each SUM ... FILTER. With no direction='in' row anywhere for the dia,
    `SUM(out) - NULL` was NULL and collapsed to 0 -- so every prior issue
    silently vanished from the balance, stock read as if nothing had been
    issued, and the core issue>stock invariant under-fired.

    1000 received, 800 issued, then 500 more: only 200 is left, so the second
    issue must be flagged. Pre-fix it passed clean.
    """
    vendor_id, contractor_id, dia_id = await _seed_master_data(
        superuser_session, seeded_project["project"].id
    )

    await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id), "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "1000", "receipt_type": "against_po",
            "gate_entry_at": "2026-06-15T09:00:00Z",
        },
    )

    first = await app_client.post(
        "/api/v1/store-issues",
        headers=auth_headers,
        json={
            "contractor_id": str(contractor_id), "dia_grade_id": str(dia_id),
            "quantity_kg": "800", "direction": "out", "effective_date": "2026-06-16",
        },
    )
    assert first.status_code == 201
    assert first.json()["warning"] is None  # 800 <= 1000, fine

    second = await app_client.post(
        "/api/v1/store-issues",
        headers=auth_headers,
        json={
            "contractor_id": str(contractor_id), "dia_grade_id": str(dia_id),
            "quantity_kg": "500", "direction": "out", "effective_date": "2026-06-17",
        },
    )
    assert second.status_code == 201
    warning = second.json()["warning"]
    assert warning is not None, "the first issue was not subtracted from available stock"
    assert "available stock is 200" in warning
