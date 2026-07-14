"""End-to-end HTTP tests for the 2026-07 manipulation-catching rules:
jmr_exceeds_bbs_plan (actual vs BBS-planned qty, +/-10% tolerance) and
duplicate_pour_entry (one JMR per element unless it's an explicit
correction) -- mirrors test_issue_exceeds_stock.py's structure.
"""

import uuid

import pytest
from sqlalchemy import text


async def _seed_structure_and_plan(superuser_session, project_id, planned_weight_kg="100"):
    """tower/floor/element/dia_grade + one bbs_plan row for that element+dia --
    unique suffixes per call so independent tests sharing one container don't collide.
    """
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
    await superuser_session.execute(
        text(
            "INSERT INTO bbs_plan (project_id, tower_id, floor_id, element_id, dia_grade_id, "
            "planned_weight_kg, created_by) "
            "SELECT :pid, :tid, :fid, :eid, :dia, :planned, id FROM users LIMIT 1"
        ),
        {"pid": project_id, "tid": tower_id, "fid": floor_id, "eid": element_id, "dia": dia_id, "planned": planned_weight_kg},
    )
    await superuser_session.commit()
    return tower_id, floor_id, element_id, dia_id


@pytest.mark.asyncio
async def test_jmr_within_tolerance_succeeds_with_no_warning(
    app_client, seeded_project, auth_headers, superuser_session
):
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id = await _seed_structure_and_plan(superuser_session, project_id)

    resp = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id),
            "floor_id": str(floor_id),
            "element_id": str(element_id),
            "dia_grade_id": str(dia_id),
            "measured_weight_kg": "105",
            "effective_date": "2026-06-16",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["warning"] is None


@pytest.mark.asyncio
async def test_jmr_exceeding_bbs_plan_gets_advisory_warning(
    app_client, seeded_project, auth_headers, superuser_session
):
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id = await _seed_structure_and_plan(superuser_session, project_id)

    resp = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id),
            "floor_id": str(floor_id),
            "element_id": str(element_id),
            "dia_grade_id": str(dia_id),
            "measured_weight_kg": "150",
            "effective_date": "2026-06-16",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["warning"] is not None
    assert "exceeds the BBS-planned quantity" in body["warning"]

    # superuser_session, not db_session -- exception_log is RLS-protected and
    # db_session carries no RLS context, so it would see zero rows regardless
    # of whether the write actually happened (same reasoning as _seed_master_data).
    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    exception_count = await superuser_session.execute(
        text(
            "SELECT count(*) FROM exception_log WHERE project_id = :pid AND rule_name = 'jmr_exceeds_bbs_plan'"
        ),
        {"pid": project_id},
    )
    assert exception_count.scalar_one() == 1


@pytest.mark.asyncio
async def test_second_jmr_for_same_element_flags_duplicate_pour(
    app_client, seeded_project, auth_headers, superuser_session
):
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id = await _seed_structure_and_plan(
        superuser_session, project_id, planned_weight_kg="1000"
    )

    first = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id),
            "floor_id": str(floor_id),
            "element_id": str(element_id),
            "dia_grade_id": str(dia_id),
            "measured_weight_kg": "10",
            "effective_date": "2026-06-16",
        },
    )
    assert first.status_code == 201
    assert first.json()["warning"] is None

    second = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id),
            "floor_id": str(floor_id),
            "element_id": str(element_id),
            "dia_grade_id": str(dia_id),
            "measured_weight_kg": "10",
            "effective_date": "2026-06-17",
        },
    )
    assert second.status_code == 201
    body = second.json()
    assert body["warning"] is not None
    assert "already has 1 recorded JMR entry" in body["warning"]


@pytest.mark.asyncio
async def test_jmr_with_no_element_linked_skips_both_rules(
    app_client, seeded_project, auth_headers, superuser_session
):
    """Some historical/coarse-grained entries won't link an element -- neither
    rule can check them, and they must not be blocked or warned on."""
    project_id = seeded_project["project"].id
    tower_id, floor_id, _element_id, dia_id = await _seed_structure_and_plan(superuser_session, project_id)

    resp = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json={
            "tower_id": str(tower_id),
            "floor_id": str(floor_id),
            "dia_grade_id": str(dia_id),
            "measured_weight_kg": "5000",
            "effective_date": "2026-06-16",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["warning"] is None


def _jmr_payload(tower_id, floor_id, element_id, dia_id, weight, date="2026-06-16", **extra):
    return {
        "tower_id": str(tower_id),
        "floor_id": str(floor_id),
        "element_id": str(element_id),
        "dia_grade_id": str(dia_id),
        "measured_weight_kg": weight,
        "effective_date": date,
        **extra,
    }


@pytest.mark.asyncio
async def test_correction_supersedes_original_no_duplicate_flag_no_double_count(
    app_client, seeded_project, auth_headers, superuser_session
):
    """The full correction contract: (1) a correction linking corrected_from_id
    doesn't trip duplicate_pour_entry; (2) the BBS cumulative check evaluates
    the REPLACEMENT weight, not original+replacement; (3) Abstract section E
    counts only the correction -- the original is superseded, never summed.
    """
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id = await _seed_structure_and_plan(superuser_session, project_id)

    first = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json=_jmr_payload(tower_id, floor_id, element_id, dia_id, "90"),
    )
    assert first.status_code == 201
    assert first.json()["warning"] is None
    first_id = first.json()["id"]

    # Correct 90 -> 105. Plan is 100, tolerance 10% => allowed max 110.
    # If the original still counted, cumulative would be 195 and this would flag.
    correction = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json=_jmr_payload(tower_id, floor_id, element_id, dia_id, "105", corrected_from_id=first_id),
    )
    assert correction.status_code == 201
    assert correction.json()["warning"] is None

    # Abstract E for June must count 105 once -- not 90, not 195.
    abstract = await app_client.get(
        "/api/v1/abstract", headers=auth_headers, params={"year": 2026, "month": 6}
    )
    assert abstract.status_code == 200
    e_rows = abstract.json()["section_e_consumption"]
    dia_12_total = sum(
        float(r["consumption_kg"]) for r in e_rows if float(r["dia"]) == 12.0
    )
    assert dia_12_total == 105.0


@pytest.mark.asyncio
async def test_correcting_an_already_corrected_row_is_rejected_409(
    app_client, seeded_project, auth_headers, superuser_session
):
    """Forks are refused: two corrections of the same original would both stay
    'active' and double-count -- chains only (correct the correction instead)."""
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id = await _seed_structure_and_plan(
        superuser_session, project_id, planned_weight_kg="1000"
    )

    first = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json=_jmr_payload(tower_id, floor_id, element_id, dia_id, "10"),
    )
    first_id = first.json()["id"]

    fix_one = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json=_jmr_payload(tower_id, floor_id, element_id, dia_id, "12", corrected_from_id=first_id),
    )
    assert fix_one.status_code == 201

    fork = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json=_jmr_payload(tower_id, floor_id, element_id, dia_id, "14", corrected_from_id=first_id),
    )
    assert fork.status_code == 409
    assert fork.json()["error"]["code"] == "already_corrected"

    # Chain continues fine: correct the correction.
    chain = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json=_jmr_payload(
            tower_id, floor_id, element_id, dia_id, "14", corrected_from_id=fix_one.json()["id"]
        ),
    )
    assert chain.status_code == 201


@pytest.mark.asyncio
async def test_correcting_a_nonexistent_row_is_404(
    app_client, seeded_project, auth_headers, superuser_session
):
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id = await _seed_structure_and_plan(superuser_session, project_id)

    resp = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json=_jmr_payload(
            tower_id, floor_id, element_id, dia_id, "10", corrected_from_id=str(uuid.uuid4())
        ),
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


@pytest.mark.asyncio
async def test_tolerance_pct_override_from_rule_thresholds_is_honored(
    app_client, seeded_project, auth_headers, superuser_session
):
    """A rule_thresholds tolerance_pct row must actually change behavior --
    before 2026-07-14 only 'mode' was ever read back and numeric rows were
    dead config. Plan=100, entry=140 (+40%): default 10% would flag; a 50%
    project override must let it pass clean."""
    project_id = seeded_project["project"].id
    tower_id, floor_id, element_id, dia_id = await _seed_structure_and_plan(superuser_session, project_id)

    await superuser_session.execute(
        text(
            "INSERT INTO rule_thresholds (rule_name, project_id, threshold_key, threshold_value, mode) "
            "VALUES ('jmr_exceeds_bbs_plan', :pid, 'tolerance_pct', 50, 'advisory')"
        ),
        {"pid": project_id},
    )
    await superuser_session.commit()

    resp = await app_client.post(
        "/api/v1/jmr-actuals",
        headers=auth_headers,
        json=_jmr_payload(tower_id, floor_id, element_id, dia_id, "140"),
    )
    assert resp.status_code == 201
    assert resp.json()["warning"] is None
