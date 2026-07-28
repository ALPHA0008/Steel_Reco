"""End-to-end tests for the 2026-07-16 hardening sweep:

- transfer_exceeds_stock: a loan-out transfer draws on the store pool and is
  advisory-flagged (and blockable) when it exceeds available stock.
- finalize future-month guard: a period after the current calendar month is
  refused (finalizing would lock out entries that don't exist yet).
- weight CHECK constraints: negative/zero measured weight and a tare heavier
  than gross are rejected (DB CHECK + Pydantic, surfaced as a clean 4xx).
"""

import uuid

import pytest
from sqlalchemy import text


async def _seed_master_data(superuser_session):
    suffix = uuid.uuid4().hex[:8]
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    vendor_id = (
        await superuser_session.execute(
            text("INSERT INTO vendors (name) VALUES (:n) RETURNING id"), {"n": f"V-{suffix}"}
        )
    ).scalar_one()
    contractor_id = (
        await superuser_session.execute(
            text("INSERT INTO contractors (code, name) VALUES (:c, :n) RETURNING id"),
            {"c": f"KLC-{suffix}", "n": f"KLC {suffix}"},
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


@pytest.mark.asyncio
async def test_transfer_out_exceeding_stock_gets_advisory_warning(
    app_client, seeded_project, auth_headers, superuser_session
):
    """Loan out more than was ever received -> advisory warning (the transfer
    still saves; inter-site movement is genuinely under-recorded in legacy
    data, so this flags rather than blocks by default)."""
    project_id = seeded_project["project"].id
    vendor_id, _c, dia_id = await _seed_master_data(superuser_session)

    # receive 1000
    await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id), "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "1000", "receipt_type": "against_po",
            "gate_entry_at": "2026-06-15T09:00:00Z",
        },
    )

    # loan out 5000 -> exceeds the 1000 pool
    resp = await app_client.post(
        "/api/v1/inter-site-transfers",
        headers=auth_headers,
        json={
            "to_project_id": str(project_id), "dia_grade_id": str(dia_id),
            "quantity_kg": "5000", "flag": "loan", "record_source": "sap",
            "effective_date": "2026-06-16",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["warning"] is not None
    assert "exceeds stock for this diameter" in resp.json()["warning"]

    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    count = (
        await superuser_session.execute(
            text(
                "SELECT count(*) FROM exception_log WHERE project_id = :pid "
                "AND rule_name = 'transfer_exceeds_stock'"
            ),
            {"pid": project_id},
        )
    ).scalar_one()
    assert count == 1


@pytest.mark.asyncio
async def test_transfer_return_inbound_never_flagged_even_with_zero_stock(
    app_client, seeded_project, auth_headers, superuser_session
):
    """A 'return' inbound adds to the pool -- it must never trip the stock
    rule even when current stock is zero."""
    project_id = seeded_project["project"].id
    _v, _c, dia_id = await _seed_master_data(superuser_session)

    resp = await app_client.post(
        "/api/v1/inter-site-transfers",
        headers=auth_headers,
        json={
            "to_project_id": str(project_id), "dia_grade_id": str(dia_id),
            "quantity_kg": "300", "flag": "return", "record_source": "sap",
            "effective_date": "2026-06-16",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["warning"] is None


@pytest.mark.asyncio
async def test_transfer_out_blocking_mode_rejects_with_zero_rows(
    app_client, seeded_project, auth_headers, superuser_session
):
    project_id = seeded_project["project"].id
    vendor_id, _c, dia_id = await _seed_master_data(superuser_session)
    await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id), "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "100", "receipt_type": "against_po",
            "gate_entry_at": "2026-06-15T09:00:00Z",
        },
    )
    await superuser_session.execute(
        text(
            "INSERT INTO rule_thresholds (rule_name, project_id, threshold_key, mode) "
            "VALUES ('transfer_exceeds_stock', :pid, 'mode', 'blocking')"
        ),
        {"pid": project_id},
    )
    await superuser_session.commit()

    resp = await app_client.post(
        "/api/v1/inter-site-transfers",
        headers=auth_headers,
        json={
            "to_project_id": str(project_id), "dia_grade_id": str(dia_id),
            "quantity_kg": "500", "flag": "loan", "record_source": "sap",
            "effective_date": "2026-06-16",
        },
    )
    assert resp.status_code == 422

    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    n = (
        await superuser_session.execute(
            text("SELECT count(*) FROM inter_site_transfer WHERE project_id = :pid"),
            {"pid": project_id},
        )
    ).scalar_one()
    assert n == 0


@pytest.mark.asyncio
async def test_finalize_future_month_is_rejected(app_client, seeded_project, auth_headers):
    """Finalizing a month well in the future locks out entries that don't
    exist yet -- refused with a clean 422."""
    resp = await app_client.post(
        "/api/v1/month-close/finalize", headers=auth_headers, json={"year": 2099, "month": 12}
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "future_month_finalize"


@pytest.mark.asyncio
async def test_negative_measured_weight_rejected(app_client, seeded_project, auth_headers, superuser_session):
    """A negative JMR measured weight would SUBTRACT from consumption (E),
    masking wastage -- rejected by the Pydantic gt=0 guard / DB CHECK."""
    suffix = uuid.uuid4().hex[:8]
    project_id = seeded_project["project"].id
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    dia_id = (
        await superuser_session.execute(
            text(
                "INSERT INTO dia_grades (diameter_mm, grade, unit_weight_kg_per_m) "
                "VALUES (12, :g, 0.89) RETURNING id"
            ),
            {"g": f"Fe500-{suffix}"},
        )
    ).scalar_one()
    tower_id = (
        await superuser_session.execute(
            text("INSERT INTO towers (project_id, name) VALUES (:p, :n) RETURNING id"),
            {"p": project_id, "n": f"T-{suffix}"},
        )
    ).scalar_one()
    floor_id = (
        await superuser_session.execute(
            text(
                "INSERT INTO floors (tower_id, project_id, level_name) "
                "VALUES (:t, :p, 'B2') RETURNING id"
            ),
            {"t": tower_id, "p": project_id},
        )
    ).scalar_one()
    await superuser_session.commit()

    resp = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id), "floor_id": str(floor_id),
            "dia_grade_id": str(dia_id), "measured_weight_kg": "-50",
            "effective_date": "2026-06-16",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_grn_tare_heavier_than_gross_rejected(app_client, seeded_project, auth_headers, superuser_session):
    """A tare heavier than gross means a negative net -- rejected."""
    vendor_id, _c, dia_id = await _seed_master_data(superuser_session)
    resp = await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id), "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "500", "receipt_type": "against_po",
            "gate_entry_at": "2026-06-15T09:00:00Z",
            "gross_weight_kg": "10", "tare_weight_kg": "20",
        },
    )
    assert resp.status_code == 422
