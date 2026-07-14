import uuid
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory, set_rls_context
from app.models.system import ProjectAssignment, User
from app.security import JWTError, decode_access_token

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(_oauth2_scheme)],
) -> tuple[uuid.UUID, str]:
    """Decodes the JWT and returns (user_id, role) — does NOT touch the DB,
    so it can run before any session/RLS context exists. Raises 401 on any
    invalid/expired/malformed token.
    """
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
        role = payload["role"]
    except (JWTError, KeyError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc
    return user_id, role


CurrentUser = Annotated[tuple[uuid.UUID, str], Depends(get_current_user)]


async def get_scoped_session(current_user: CurrentUser) -> AsyncIterator[AsyncSession]:
    """The session dependency every authenticated route must use. Sets the
    RLS session GUCs (plan §3.3) before yielding, so every query issued
    through this session is subject to Row-Level Security for this user.

    A route that accidentally uses app.database.get_session instead of this
    dependency gets a session with NO RLS context set, which (per the
    policies' can_access_project() check) returns zero rows rather than
    leaking another project's data — fails closed, not open.
    """
    user_id, role = current_user
    async with async_session_factory() as session:
        await set_rls_context(session, user_id=str(user_id), user_role=role)
        yield session


ScopedSession = Annotated[AsyncSession, Depends(get_scoped_session)]


async def verify_project_access(
    current_user: CurrentUser,
    session: ScopedSession,
) -> uuid.UUID:
    """Resolves project_id from the JWT's user via project_assignments —
    NEVER from the request path/body/query (plan §5.4). This is the value
    every repository is scoped to. A QS with no assignment gets 403; v1 QS
    accounts have exactly one primary assignment (plan §3, project_assignments).
    """
    user_id, role = current_user
    if role == "admin":
        # Admin routes that need a specific project pass it explicitly;
        # this dependency is for QS-scoped routes where there's exactly one.
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Admin users must specify a project explicitly; this endpoint is QS-scoped",
        )

    result = await session.execute(
        select(ProjectAssignment.project_id).where(
            ProjectAssignment.user_id == user_id,
            ProjectAssignment.is_primary.is_(True),
        )
    )
    project_id = result.scalar_one_or_none()
    if project_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No project assignment for this user")
    return project_id


ProjectScope = Annotated[uuid.UUID, Depends(verify_project_access)]


async def get_current_user_row(current_user: CurrentUser, session: ScopedSession) -> User:
    user_id, _role = current_user
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


async def require_admin(current_user: CurrentUser) -> uuid.UUID:
    """Gate for admin-only routes (user management, monitoring). `users` and
    `project_assignments` carry NO row-level security (plan §3.1/§3.3 — they
    are identity tables, not tenant data), so unlike every other route in
    this app, RLS does not stop a non-admin from reading every user's row
    here; this explicit role check is the only guard, not defense-in-depth
    on top of one.
    """
    user_id, role = current_user
    if role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user_id


RequireAdmin = Annotated[uuid.UUID, Depends(require_admin)]
