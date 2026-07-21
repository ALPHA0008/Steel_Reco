"""End-to-end tests for the abstract-level cross-checks (2026-07-14):
the WIP->consumption transition (an element with a JMR stops counting as WIP)
and the aggregate findings (E+F vs BBS, wastage cap, scrap vs generated,
safety steel vs backup) that annotate every computed Abstract.
"""

import uuid
from datetime import date

import pytest
from sqlalchemy import text


async def _seed(superuser_session, project_id, planned_weight_kg="100", with_plan=True):
    """tower/floor/element/dia/contractor (+ optional bbs_plan row)."""
    suffix = uuid.uuid4().hex[:8]
    await superuser_session.execute(text("SET app.user_role = 'admin'"))

    dia_id = (
        await superuser_session.execute(
            text(
                "INSERT INTO dia_grades (diameter_mm, grade, unit_weight_kg_per_m) "
                "VALUES (12, :grade, 0.89) RETURNING id"
            ),
            {"grade": f"Fe500-{suffix}"},
        )
    ).scalar_one()
    contractor_id = (
        await superuser_session.execute(
            text("INSERT INTO contractors (code, name) VALUES (:code, :name) RETURNING id"),
            {"code": f"KLC-{suffix}", "name": f"KLC Test {suffix}"},
        )
    ).scalar_one()
    tower_id = (
        await superuser_session.execute(
            text("INSERT INTO towers (project_id, name) VALUES (:pid, :name) RETURNING id"),
            {"pid": project_id, "name": f"Tower-{suffix}"},
        )
    ).scalar_one()
    floor_id = (
        await superuser_session.execute(
            text(
                "INSERT INTO floors (tower_id, project_id, level_name) "
                "VALUES (:tid, :pid, 'B2') RETURNING id"
            ),
            {"tid": tower_id, "pid": project_id},
        )
    ).scalar_one()
    element_id = (
        await superuser_session.execute(
            text(
                "INSERT INTO elements (tower_id, floor_id, project_id, element_type, name) "
                "VALUES (:tid, :fid, :pid, 'slab', :name) RETURNING id"
            ),
            {"tid": tower_id, "fid": floor_id, "pid": project_id, "name": f"Slab-{suffix}"},
        )
    ).scalar_one()
    if with_plan:
        await superuser_session.execute(
            text(
                "INSERT INTO bbs_plan (project_id, tower_id, floor_id, element_id, dia_grade_id, "
                "planned_weight_kg, created_by) "
                "SELECT :pid, :tid, :fid, :eid, :dia, :planned, id FROM users LIMIT 1"
            ),
            {"pid": project_id, "tid": tower_id, "fid": floor_id, "eid": element_id,
             "dia": dia_id, "planned": planned_weight_kg},
        )
    await superuser_session.commit()
    return tower_id, floor_id, element_id, dia_id, contractor_id


async def _set_progress(superuser_session, project_id, element_id, pct, as_of=date(2026, 6, 10)):
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    await superuser_session.execute(
        text(
            "INSERT INTO element_progress (project_id, element_id, as_of_date, completion_pct, created_by) "
            "SELECT :pid, :eid, :dt, :pct, id FROM users LIMIT 1"
        ),
        {"pid": project_id, "eid": element_id, "dt": as_of, "pct": pct},
    )
    await superuser_session.commit()


async def _get_abstract(app_client, auth_headers, year=2026, month=6):
    resp = await app_client.get(
        "/api/v1/abstract", headers=auth_headers, params={"year": year, "month": month}
    )
    assert resp.status_code == 200
    return resp.json()


def _dia_total(rows, key, dia=12.0):
    return sum(float(r[key]) for r in rows if float(r["dia"]) == dia)


@pytest.mark.asyncio
async def test_jmr_moves_element_from_wip_to_consumption(
    app_client, seeded_project, auth_headers, superuser_session
):
    """The WIP->consumption transition: with only a completion %, the element
    is WIP (F = plan x pct); the moment a JMR lands it leaves F entirely and
    its measured weight is E -- G must never carry both."""
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id, _ = await _seed(superuser_session, project_id)
    await _set_progress(superuser_session, project_id, element_id, 50)

    before = await _get_abstract(app_client, auth_headers)
    assert _dia_total(before["section_f_wip"], "wip_kg") == 50.0  # 100 x 50%

    jmr = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id),
            "floor_id": str(floor_id),
            "element_id": str(element_id),
            "dia_grade_id": str(dia_id),
            "measured_weight_kg": "60",
            "effective_date": "2026-06-16",
        },
    )
    assert jmr.status_code == 201

    after = await _get_abstract(app_client, auth_headers)
    assert _dia_total(after["section_f_wip"], "wip_kg") == 0.0  # left WIP
    assert _dia_total(after["section_e_consumption"], "consumption_kg") == 60.0
    assert float(after["section_g_consumption_plus_wip"].get("12.0", 0)) == 60.0  # not 110


@pytest.mark.asyncio
async def test_consumption_without_bbs_plan_finding(
    app_client, seeded_project, auth_headers, superuser_session
):
    project_id = seeded_project["project"].id
    tower_id, floor_id, _element_id, dia_id, _ = await _seed(
        superuser_session, project_id, with_plan=False
    )

    # No element linked -- entry rules skip it silently. The aggregate
    # finding is what catches that this consumption is unverifiable.
    resp = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id),
            "floor_id": str(floor_id),
            "dia_grade_id": str(dia_id),
            "measured_weight_kg": "200",
            "effective_date": "2026-06-16",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["warning"] is None  # entry rules didn't catch it...

    abstract = await _get_abstract(app_client, auth_headers)
    rules = [f["rule"] for f in abstract["findings"]]
    assert "consumption_without_bbs_plan" in rules  # ...but the Abstract does


@pytest.mark.asyncio
async def test_consumption_wip_exceeds_bbs_finding(
    app_client, seeded_project, auth_headers, superuser_session
):
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id, _ = await _seed(superuser_session, project_id)

    resp = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id),
            "floor_id": str(floor_id),
            "element_id": str(element_id),
            "dia_grade_id": str(dia_id),
            "measured_weight_kg": "150",  # plan 100, tolerance 10% -> over
            "effective_date": "2026-06-16",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["warning"] is not None  # caught at entry (advisory)...

    abstract = await _get_abstract(app_client, auth_headers)
    over = [f for f in abstract["findings"] if f["rule"] == "consumption_wip_exceeds_bbs"]
    assert len(over) == 1  # ...and again at the Abstract level
    assert float(over[0]["actual_kg"]) == 150.0


@pytest.mark.asyncio
async def test_wastage_over_cap_and_scrap_exceeds_generated_findings(
    app_client, seeded_project, auth_headers, superuser_session
):
    """C=105 received, E=100 consumed -> H=5 theoretical stock; K=1 physical
    (most of it missing) -> L=4, M = L/G = 4/100 = 4% > the 3% cap.
    Scrap sold 500kg with nothing plausibly generated -> leakage finding."""
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id, contractor_id = await _seed(
        superuser_session, project_id
    )

    vendor_id = (
        await superuser_session.execute(
            text("INSERT INTO vendors (name) VALUES (:n) RETURNING id"), {"n": f"V-{uuid.uuid4().hex[:8]}"}
        )
    ).scalar_one()
    user_id = (await superuser_session.execute(text("SELECT id FROM users LIMIT 1"))).scalar_one()
    await superuser_session.execute(
        text(
            "INSERT INTO grn (project_id, vendor_id, dia_grade_id, weighbridge_weight_kg, receipt_type, "
            "gate_entry_at, effective_date, created_by) "
            "VALUES (:pid, :vid, :dia, 105, 'against_po', '2026-06-10T09:00:00Z', '2026-06-10', :uid)"
        ),
        {"pid": project_id, "vid": vendor_id, "dia": dia_id, "uid": user_id},
    )
    await superuser_session.commit()

    await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id),
            "floor_id": str(floor_id),
            "element_id": str(element_id),
            "dia_grade_id": str(dia_id),
            "measured_weight_kg": "100",
            "effective_date": "2026-06-16",
        },
    )
    count = await app_client.post(
        "/api/v1/physical-counts",
        headers=auth_headers,
        json={
            "contractor_id": str(contractor_id),
            "dia_grade_id": str(dia_id),
            "bundle_count": 1,
            "each_bundle_weight_kg": "1",
            "effective_date": "2026-06-20",
        },
    )
    assert count.status_code == 201
    scrap = await app_client.post(
        "/api/v1/scrap-sales",
        headers=auth_headers,
        json={
            "buyer_name": "Test Buyer",
            "weight_kg": "500",
            "rate_per_kg": "20",
            "effective_date": "2026-06-21",
        },
    )
    assert scrap.status_code == 201

    abstract = await _get_abstract(app_client, auth_headers)
    rules = [f["rule"] for f in abstract["findings"]]
    assert "wastage_over_contract_cap" in rules
    assert "scrap_sold_exceeds_generated" in rules


@pytest.mark.asyncio
async def test_safety_steel_unverifiable_then_verified_by_backup(
    app_client, seeded_project, auth_headers, superuser_session
):
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id, contractor_id = await _seed(superuser_session, project_id)

    count = await app_client.post(
        "/api/v1/physical-counts",
        headers=auth_headers,
        json={
            "contractor_id": str(contractor_id),
            "dia_grade_id": str(dia_id),
            "bundle_count": 0,
            "effective_date": "2026-06-20",
            "cut_pieces": [
                {"length_mm": 2000, "nos": 1, "weight_kg": "50",
                 "classification": "used_as_safety_steel"}
            ],
        },
    )
    assert count.status_code == 201

    abstract = await _get_abstract(app_client, auth_headers)
    rules = [f["rule"] for f in abstract["findings"]]
    assert "safety_steel_unverifiable" in rules  # no backup imported yet

    # Import a safety backup covering the claim -> the finding clears.
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    await superuser_session.execute(
        text(
            "INSERT INTO bbs_plan (project_id, tower_id, floor_id, element_id, dia_grade_id, "
            "planned_weight_kg, source_file, created_by) "
            "SELECT :pid, :tid, :fid, :eid, :dia, 100, 'Steel Qty-Safety-Misc Works.xlsx', id "
            "FROM users LIMIT 1"
        ),
        {"pid": project_id, "tid": tower_id, "fid": floor_id, "eid": element_id, "dia": dia_id},
    )
    await superuser_session.commit()

    abstract = await _get_abstract(app_client, auth_headers)
    rules = [f["rule"] for f in abstract["findings"]]
    assert "safety_steel_unverifiable" not in rules
    assert "safety_steel_exceeds_backup" not in rules  # 50 <= 100 x 1.1
