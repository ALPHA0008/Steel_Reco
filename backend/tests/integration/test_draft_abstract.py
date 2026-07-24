"""Quick Draft mode: type A-N per diameter, get the SAME derived math and
plausibility checks as the real Abstract, without any ledger rows or writes.
"""

import pytest


@pytest.mark.asyncio
async def test_draft_derives_same_math_as_real_abstract(app_client, seeded_project, auth_headers):
    resp = await app_client.post(
        "/api/v1/abstract/draft",
        headers=auth_headers,
        json={
            "period_label": "2026-06 (draft)",
            "cap_pct": "3.00",
            "section_a_received": {"16": "1000"},
            "section_b_transferred": {"16": "0"},
            "section_d_issued": {"16": "900"},
            "section_e_consumption": {"16": "800"},
            "section_f_wip": {"16": "50"},
            "section_i_physical_full_length": {"16": "120"},
            "section_j_physical_cut_pieces": {"16": "10"},
            "section_myhome_stock": {"16": "20"},
            "section_n_scrap_sold_kg": "5",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # C = A - B = 1000
    assert body["section_c_net_received"]["16"] == "1000"
    # G = E + F = 850
    assert body["section_g_consumption_plus_wip"]["16"] == "850"
    # H = C - G = 150
    assert body["section_h_theoretical_stock"]["16"] == "150"
    # K = I + J + MyHome = 120 + 10 + 20 = 150
    assert body["section_k_total_physical"]["16"] == "150"
    # L = H - K = 0
    assert body["section_l_wastage_qty"]["16"] == "0"
    # M = L/G = 0%
    assert float(body["section_m_wastage_pct"]) == 0.0
    assert body["is_draft"] is True


@pytest.mark.asyncio
async def test_draft_flags_issued_exceeding_net_received(app_client, seeded_project, auth_headers):
    resp = await app_client.post(
        "/api/v1/abstract/draft",
        headers=auth_headers,
        json={
            "period_label": "2026-06 (draft)",
            "section_a_received": {"16": "1000"},
            "section_d_issued": {"16": "1500"},  # physically impossible: > A
        },
    )
    assert resp.status_code == 200, resp.text
    rules = {f["rule"] for f in resp.json()["findings"]}
    assert "issued_exceeds_net_received" in rules


@pytest.mark.asyncio
async def test_draft_flags_wastage_over_cap(app_client, seeded_project, auth_headers):
    resp = await app_client.post(
        "/api/v1/abstract/draft",
        headers=auth_headers,
        json={
            "period_label": "2026-06 (draft)",
            "cap_pct": "3.00",
            "section_a_received": {"16": "2000"},
            "section_e_consumption": {"16": "1000"},
            "section_i_physical_full_length": {"16": "800"},
            # C=2000, G=1000, H=C-G=1000, K=800 -> L=200, M=L/G=20% >> 3% cap
        },
    )
    assert resp.status_code == 200, resp.text
    rules = {f["rule"] for f in resp.json()["findings"]}
    assert "wastage_over_contract_cap" in rules


@pytest.mark.asyncio
async def test_draft_flags_negative_net_received_as_sign_error(app_client, seeded_project, auth_headers):
    resp = await app_client.post(
        "/api/v1/abstract/draft",
        headers=auth_headers,
        json={
            "period_label": "2026-06 (draft)",
            "section_a_received": {"16": "100"},
            "section_b_transferred": {"16": "500"},  # B > A: impossible
        },
    )
    assert resp.status_code == 200, resp.text
    rules = {f["rule"] for f in resp.json()["findings"]}
    assert "negative_net_received" in rules


@pytest.mark.asyncio
async def test_draft_never_writes_to_the_ledger(app_client, seeded_project, auth_headers, superuser_session):
    from sqlalchemy import text

    project_id = seeded_project["project"].id
    await app_client.post(
        "/api/v1/abstract/draft",
        headers=auth_headers,
        json={"period_label": "x", "section_a_received": {"16": "999999"}},
    )
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    grn_count = (
        await superuser_session.execute(
            text("SELECT count(*) FROM grn WHERE project_id = :pid"), {"pid": project_id}
        )
    ).scalar_one()
    assert grn_count == 0
