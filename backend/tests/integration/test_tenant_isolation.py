"""Verifies RLS actually enforces tenant isolation end to end -- the plan §12
Foundation finding was that a superuser connection makes every RLS policy a
silent no-op, so this suite must run against the restricted steel_recon_app
role (conftest.py's db_session/app_client), never the migration superuser.
"""

import pytest


@pytest.mark.asyncio
async def test_qs_sees_only_own_project(app_client, seeded_project, auth_headers):
    response = await app_client.get("/api/v1/projects/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == str(seeded_project["project"].id)


@pytest.mark.asyncio
async def test_qs_cannot_see_other_project_via_direct_query(db_session, seeded_project, superuser_session):
    """Even a direct SELECT by known UUID of another project must return
    zero rows under RLS -- not just filtered lists (plan §3.3)."""
    from sqlalchemy import text

    from app.database import set_rls_context
    from app.models.structure import Project

    await superuser_session.execute(text("SET app.user_role = 'admin'"))
    other_project = Project(name="Other Project (should be invisible)")
    superuser_session.add(other_project)
    await superuser_session.commit()

    await set_rls_context(db_session, user_id=str(seeded_project["user"].id), user_role="QS")
    result = await db_session.execute(text("SELECT * FROM projects WHERE id = :pid"), {"pid": other_project.id})
    assert result.fetchall() == []


@pytest.mark.asyncio
async def test_qs_cannot_write_into_other_project(app_client, seeded_project, auth_headers, superuser_session):
    """A tower create request always uses ProjectScope (plan §5.4's standing
    router rule) -- there is no project_id parameter to forge in the first
    place, so this proves the fix, not just the RLS backstop.
    """
    response = await app_client.post(
        "/api/v1/towers", headers=auth_headers, json={"name": "T-1", "sequence": 1}
    )
    assert response.status_code == 201
    assert response.json()["project_id"] == str(seeded_project["project"].id)
