"""Automates the manual end-to-end Abstract verification done during
implementation (plan §12, Phase 1d finding): every section must trace
correctly back to real ledger rows, and the derived arithmetic
(C=A-B, G=E+F, H=C-G, K=I+J, L=H-K, M=L/G) must be internally consistent.
"""

import uuid
from decimal import Decimal

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
    contractor_id = (
        await superuser_session.execute(
            text("INSERT INTO contractors (code, name) VALUES (:c, :n) RETURNING id"),
            {"c": f"C{suffix}", "n": f"Contractor {suffix}"},
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
async def test_abstract_sections_trace_correctly_to_ledger_rows(
    app_client, seeded_project, auth_headers, superuser_session
):
    vendor_id, contractor_id, dia_id = await _seed_masters(superuser_session)
    project_id = seeded_project["project"].id

    # A: 2000 kg received against PO
    r = await app_client.post(
        "/api/v1/grn",
        headers=auth_headers,
        json={
            "vendor_id": str(vendor_id), "dia_grade_id": str(dia_id),
            "weighbridge_weight_kg": "2000", "receipt_type": "against_po",
            "gate_entry_at": "2026-05-10T09:00:00Z",
        },
    )
    assert r.status_code == 201

    # B: 100 kg transferred out
    r = await app_client.post(
        "/api/v1/inter-site-transfers",
        headers=auth_headers,
        json={
            "to_project_id": str(project_id), "dia_grade_id": str(dia_id),
            "quantity_kg": "100", "flag": "loan", "record_source": "sap",
            "effective_date": "2026-05-11",
        },
    )
    assert r.status_code == 201

    # D: 800 kg issued out (well within stock, no advisory noise to account for)
    r = await app_client.post(
        "/api/v1/store-issues",
        headers=auth_headers,
        json={
            "contractor_id": str(contractor_id), "dia_grade_id": str(dia_id),
            "quantity_kg": "800", "direction": "out", "effective_date": "2026-05-12",
        },
    )
    assert r.status_code == 201

    # N: scrap sold
    r = await app_client.post(
        "/api/v1/scrap-sales",
        headers=auth_headers,
        json={"buyer_name": "Test Buyer", "weight_kg": "50", "rate_per_kg": "20", "effective_date": "2026-05-13"},
    )
    assert r.status_code == 201

    abstract_resp = await app_client.get(
        "/api/v1/abstract", headers=auth_headers, params={"year": 2026, "month": 5}
    )
    assert abstract_resp.status_code == 200
    data = abstract_resp.json()

    dia_key = "16.0"
    a_total = Decimal(str(data["section_a_received"][0]["total_received_kg"]))
    b_total = Decimal(str(data["section_b_transferred"][0]["total_transferred_kg"]))
    c_total = Decimal(str(data["section_c_net_received"][dia_key]))
    d_total = Decimal(str(data["section_d_issued"][0]["net_issued_kg"]))
    n_total = Decimal(str(data["section_n_scrap_sold_kg"]))

    assert a_total == Decimal("2000")
    assert b_total == Decimal("100")
    assert c_total == a_total - b_total == Decimal("1900")
    assert d_total == Decimal("800")
    assert n_total == Decimal("50")

    # No consumption/WIP/physical-count data this month -> G=0, H=C, K=0, L=H
    h_total = Decimal(str(data["section_h_theoretical_stock"][dia_key]))
    assert h_total == c_total  # G was 0, so H = C - 0 = C


@pytest.mark.asyncio
async def test_empty_month_returns_no_sections_not_an_error(app_client, seeded_project, auth_headers):
    """A month with zero transactions must return a valid (empty) Abstract,
    not a 500 -- every derived dict is empty, section_m is None (no division
    by a zero-total G)."""
    response = await app_client.get(
        "/api/v1/abstract", headers=auth_headers, params={"year": 2020, "month": 1}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["section_a_received"] == []
    assert data["section_m_wastage_pct"] is None
