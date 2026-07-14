import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import set_rls_context
from app.models.structure import Project
from app.models.system import ProjectAssignment, User
from app.schemas.auth import SignupRequest
from app.security import create_access_token, hash_password, verify_password


class InvalidCredentials(Exception):
    pass


class InvalidSignupCode(Exception):
    """Project not found, or its signup_code doesn't match what was supplied
    (including a project with no code set yet -- treated identically to a
    wrong code, since neither should let signup through)."""


class AccountAlreadyExists(Exception):
    """Username or email is already registered."""


async def authenticate(session: AsyncSession, *, username: str, password: str) -> str:
    """Returns a signed access token on success. Raises InvalidCredentials
    on any failure (unknown user, wrong password, inactive user) — the same
    error either way, so a login attempt can't be used to enumerate usernames.
    """
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise InvalidCredentials

    user.last_login_at = datetime.now(timezone.utc)
    await session.commit()

    return create_access_token(subject=str(user.id), role=user.role)


async def signup(session: AsyncSession, payload: SignupRequest) -> str:
    """Self-service QS signup, gated by the target project's signup_code (no
    admin-approval step). Creates the User (role=QS) and its
    ProjectAssignment in one transaction, then returns a token so the QS is
    logged in immediately -- matching the "no approval, they just start using
    it" model.

    The code check uses `secrets.compare_digest` (constant-time) rather than
    `==` so response timing can't be used to brute-force the code character
    by character. A project with signup_code IS NULL can never match, since
    an empty/missing code must not be signable-up-against.

    `projects` carries row-level security (plan §3.3); this lookup runs
    before any identity/session exists, so there is no real "current user" to
    scope the session to. Caught live: with no RLS context set at all, the
    lookup silently returned zero rows (RLS failing closed) and every signup
    attempt failed with "invalid code" even when the code was correct. This
    is structurally the same problem login already solves for `users` (which
    has no RLS at all, by design, since it's an identity table) -- signup
    needs the equivalent for this one cross-tenant `projects` read. Setting
    the session's role GUC to 'admin' for this lookup only (no user_id)
    deliberately activates accessible_project_ids()'s admin branch so the
    row is visible regardless of any assignment; nothing from this query is
    returned to the caller except the internal boolean match below.
    """
    await set_rls_context(session, user_id=None, user_role="admin")
    result = await session.execute(select(Project).where(Project.id == payload.project_id))
    project = result.scalar_one_or_none()
    if project is None or project.signup_code is None or not secrets.compare_digest(
        project.signup_code, payload.signup_code
    ):
        raise InvalidSignupCode

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role="QS",
    )
    session.add(user)
    try:
        await session.flush()  # assigns user.id, surfaces the unique-username/email violation now
    except IntegrityError as exc:
        await session.rollback()
        raise AccountAlreadyExists from exc

    session.add(ProjectAssignment(user_id=user.id, project_id=project.id, is_primary=True))
    await session.commit()

    return create_access_token(subject=str(user.id), role=user.role)
