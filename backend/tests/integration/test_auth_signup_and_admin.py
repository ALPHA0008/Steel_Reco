"""Self-service QS signup (gated by a per-project signup code, no admin
approval) and the admin monitoring/user-management surface. Runs against the
real testcontainers Postgres via app_client, exercising RLS the same way a
real request would (conftest.py's app_client/db_session/superuser_session).
"""

import uuid

import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def _admin_user(superuser_session):
    """A seeded admin account, created directly (mirrors how a real admin
    account is bootstrapped -- there is no self-service admin signup)."""
    from app.models.system import User
    from app.security import create_access_token, hash_password

    user = User(
        username=f"admin_{uuid.uuid4().hex[:8]}",
        email=f"admin_{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("admin-test-pw-123"),
        full_name="Test Admin",
        role="admin",
    )
    superuser_session.add(user)
    await superuser_session.commit()
    token = create_access_token(subject=str(user.id), role="admin")
    return {"user": user, "token": token}


@pytest.fixture
def admin_headers(_admin_user):
    return {"Authorization": f"Bearer {_admin_user['token']}"}


@pytest.mark.asyncio
async def test_signup_rejects_project_with_no_code_set(app_client, seeded_project):
    """A project that has never had a signup_code set (NULL) must reject
    every signup attempt -- "no code yet" and "wrong code" are the same
    failure, never a bypass.
    """
    response = await app_client.post(
        "/api/v1/auth/signup",
        json={
            "username": "qs_should_fail",
            "email": "qs.should.fail@example.com",
            "password": "correct-horse-1",
            "full_name": "Should Fail",
            "project_id": str(seeded_project["project"].id),
            "signup_code": "anything-at-all",
        },
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_signup_rejects_wrong_code(app_client, seeded_project, superuser_session):
    from sqlalchemy import text

    await superuser_session.execute(
        text("UPDATE projects SET signup_code = :code WHERE id = :pid"),
        {"code": "the-real-code", "pid": seeded_project["project"].id},
    )
    await superuser_session.commit()

    response = await app_client.post(
        "/api/v1/auth/signup",
        json={
            "username": "qs_wrong_code",
            "email": "qs.wrong.code@example.com",
            "password": "correct-horse-1",
            "full_name": "Wrong Code",
            "project_id": str(seeded_project["project"].id),
            "signup_code": "not-the-real-code",
        },
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_signup_succeeds_with_correct_code_and_logs_in_immediately(
    app_client, seeded_project, superuser_session
):
    """The core happy path: correct code -> account created, tied to the
    right project, and the response token works immediately (no separate
    login step, no approval gate).
    """
    from sqlalchemy import text

    await superuser_session.execute(
        text("UPDATE projects SET signup_code = :code WHERE id = :pid"),
        {"code": "the-real-code", "pid": seeded_project["project"].id},
    )
    await superuser_session.commit()

    response = await app_client.post(
        "/api/v1/auth/signup",
        json={
            "username": "qs_new_person",
            "email": "qs.new.person@example.com",
            "password": "correct-horse-1",
            "full_name": "New Person",
            "project_id": str(seeded_project["project"].id),
            "signup_code": "the-real-code",
        },
    )
    assert response.status_code == 201
    token = response.json()["access_token"]

    me = await app_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["project_id"] == str(seeded_project["project"].id)
    assert me.json()["role"] == "QS"


@pytest.mark.asyncio
async def test_signup_rejects_duplicate_username(app_client, seeded_project, superuser_session):
    from sqlalchemy import text

    await superuser_session.execute(
        text("UPDATE projects SET signup_code = :code WHERE id = :pid"),
        {"code": "the-real-code", "pid": seeded_project["project"].id},
    )
    await superuser_session.commit()

    payload = {
        "username": "qs_dupe",
        "email": "qs.dupe@example.com",
        "password": "correct-horse-1",
        "full_name": "Dupe",
        "project_id": str(seeded_project["project"].id),
        "signup_code": "the-real-code",
    }
    first = await app_client.post("/api/v1/auth/signup", json=payload)
    assert first.status_code == 201

    second = await app_client.post(
        "/api/v1/auth/signup", json={**payload, "email": "different@example.com"}
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_signup_rejects_weak_password(app_client, seeded_project):
    response = await app_client.post(
        "/api/v1/auth/signup",
        json={
            "username": "qs_weak_pw",
            "email": "qs.weak.pw@example.com",
            "password": "short",
            "full_name": "Weak Password",
            "project_id": str(seeded_project["project"].id),
            "signup_code": "whatever",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_admin_routes_reject_non_admin(app_client, auth_headers):
    """A regular QS's token must not open any /admin route (plan-equivalent
    of the standing "no route trusts client-claimed identity" rule)."""
    response = await app_client.get("/api/v1/admin/users", headers=auth_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_list_users_and_sees_project_name(app_client, seeded_project, admin_headers):
    """Regression test for the live bug: project_name must be populated, not
    NULL, for a QS with a real assignment -- this only holds if the route
    runs its projects join with RLS context actually set to admin.
    """
    response = await app_client.get("/api/v1/admin/users", headers=admin_headers)
    assert response.status_code == 200
    users = response.json()
    seeded = next(u for u in users if u["id"] == str(seeded_project["user"].id))
    assert seeded["project_id"] == str(seeded_project["project"].id)
    assert seeded["project_name"] == seeded_project["project"].name


@pytest.mark.asyncio
async def test_admin_deactivate_then_reactivate_preserves_project_name(
    app_client, seeded_project, admin_headers
):
    """Regression test for the live bug: project_name must still resolve
    correctly on the response of a route that commits mid-request before
    building its response (RLS context must be re-asserted after commit,
    not assumed to still be active).
    """
    user_id = str(seeded_project["user"].id)

    deactivate = await app_client.post(f"/api/v1/admin/users/{user_id}/deactivate", headers=admin_headers)
    assert deactivate.status_code == 200
    assert deactivate.json()["is_active"] is False
    assert deactivate.json()["project_name"] == seeded_project["project"].name

    # A deactivated user cannot log in.
    login = await app_client.post(
        "/api/v1/auth/login",
        data={"username": seeded_project["user"].username, "password": "test-password-123"},
    )
    assert login.status_code == 401

    reactivate = await app_client.post(f"/api/v1/admin/users/{user_id}/reactivate", headers=admin_headers)
    assert reactivate.status_code == 200
    assert reactivate.json()["is_active"] is True
    assert reactivate.json()["project_name"] == seeded_project["project"].name


@pytest.mark.asyncio
async def test_admin_cannot_deactivate_self(app_client, admin_headers, _admin_user):
    response = await app_client.post(
        f"/api/v1/admin/users/{_admin_user['user'].id}/deactivate", headers=admin_headers
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_admin_set_signup_code_generates_one_when_omitted(app_client, seeded_project, admin_headers):
    response = await app_client.post(
        f"/api/v1/admin/projects/{seeded_project['project'].id}/signup-code",
        headers=admin_headers,
        json={},
    )
    assert response.status_code == 200
    code = response.json()["signup_code"]
    assert len(code) >= 6


@pytest.mark.asyncio
async def test_login_rate_limit_blocks_after_threshold(app_client):
    """10 attempts/60s per app.rate_limit.login_rate_limiter. The 11th
    attempt for the same (ip, username) key must be blocked regardless of
    whether the credentials would otherwise be valid.
    """
    username = f"rate_limited_{uuid.uuid4().hex[:8]}"
    statuses = []
    for _ in range(11):
        response = await app_client.post(
            "/api/v1/auth/login", data={"username": username, "password": "wrong"}
        )
        statuses.append(response.status_code)
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429
