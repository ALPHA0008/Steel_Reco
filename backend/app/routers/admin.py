import secrets
import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.database import set_rls_context
from app.dependencies import RequireAdmin, ScopedSession
from app.models.structure import Project
from app.models.system import AuditLog, ProjectAssignment, User
from app.schemas.admin import (
    AdminAuditEntryResponse,
    AdminUserResponse,
    SetSignupCodeRequest,
    SignupCodeResponse,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


async def _user_response(session: ScopedSession, user: User) -> AdminUserResponse:
    """Builds the response, including the user's project name via a join
    against `projects` (RLS-protected). Re-asserts the admin RLS context
    immediately before this query rather than assuming the caller's context
    is still active: `set_config(..., is_local=true)` (app.database.
    set_rls_context) only lasts for the current transaction, and a caller
    that already ran `session.commit()` (deactivate/reactivate, below) has
    silently lost it -- caught live, project_name came back NULL right after
    a deactivate/reactivate despite list_users working correctly. Making this
    helper self-sufficient is safer than trusting call-site ordering.
    """
    await set_rls_context(session, user_id=None, user_role="admin")
    result = await session.execute(
        select(ProjectAssignment.project_id, Project.name)
        .join(Project, Project.id == ProjectAssignment.project_id)
        .where(ProjectAssignment.user_id == user.id, ProjectAssignment.is_primary.is_(True))
    )
    project_row = result.first()
    return AdminUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        project_id=project_row[0] if project_row else None,
        project_name=project_row[1] if project_row else None,
    )


@router.get("/users", response_model=list[AdminUserResponse])
async def list_users(_admin: RequireAdmin, session: ScopedSession) -> list[AdminUserResponse]:
    """Every user across every project/site -- the monitoring view.

    Must use ScopedSession (RLS context set from the caller's JWT), not a
    bare session: `projects` carries row-level security (plan §3.3), and its
    accessible_project_ids() only returns every project when the session GUC
    app.user_role is actually 'admin'. A bare/unauthenticated session has no
    GUCs set, so the join against `projects` silently returns zero rows
    (RLS failing closed, as designed) -- caught live: project_name came back
    NULL for every user until this route was switched from get_session to
    ScopedSession. users/project_assignments themselves carry no RLS (identity
    tables, not tenant data), so require_admin remains the only gate on *who*
    can call this at all.
    """
    result = await session.execute(
        select(User, ProjectAssignment.project_id, Project.name)
        .outerjoin(
            ProjectAssignment,
            (ProjectAssignment.user_id == User.id) & (ProjectAssignment.is_primary.is_(True)),
        )
        .outerjoin(Project, Project.id == ProjectAssignment.project_id)
        .order_by(User.created_at.desc())
    )
    return [
        AdminUserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            is_active=user.is_active,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            project_id=project_id,
            project_name=project_name,
        )
        for user, project_id, project_name in result.all()
    ]


@router.get("/users/{user_id}/activity", response_model=list[AdminAuditEntryResponse])
async def user_activity(
    user_id: uuid.UUID,
    _admin: RequireAdmin,
    session: ScopedSession,
    limit: int = 100,
) -> list[AdminAuditEntryResponse]:
    """A user's recent audit_log entries ("their movements"). audit_log
    carries RLS too, but an admin-role session sees every project's rows via
    accessible_project_ids()'s UNION branch (plan §3.3) -- ScopedSession makes
    that branch active, same reasoning as list_users above.
    """
    result = await session.execute(
        select(AuditLog)
        .where(AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(min(limit, 500))
    )
    return [AdminAuditEntryResponse.model_validate(row) for row in result.scalars().all()]


@router.post("/users/{user_id}/deactivate", response_model=AdminUserResponse)
async def deactivate_user(user_id: uuid.UUID, admin_id: RequireAdmin, session: ScopedSession) -> AdminUserResponse:
    if user_id == admin_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot deactivate your own account")

    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    user.is_active = False
    await session.commit()
    return await _user_response(session, user)


@router.post("/users/{user_id}/reactivate", response_model=AdminUserResponse)
async def reactivate_user(user_id: uuid.UUID, _admin: RequireAdmin, session: ScopedSession) -> AdminUserResponse:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    user.is_active = True
    await session.commit()
    return await _user_response(session, user)


@router.post("/projects/{project_id}/signup-code", response_model=SignupCodeResponse)
async def set_signup_code(
    project_id: uuid.UUID,
    payload: SetSignupCodeRequest,
    _admin: RequireAdmin,
    session: ScopedSession,
) -> SignupCodeResponse:
    """Sets or rotates a project's signup code. Rotating immediately
    invalidates the old code for anyone who hasn't signed up yet (it's
    compared in full, not versioned) -- intentional: if a code leaks beyond
    the intended site team, rotating it is the recovery action.
    """
    result = await session.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    project.signup_code = payload.signup_code or secrets.token_urlsafe(9)  # ~12 chars, URL-safe
    await session.commit()

    return SignupCodeResponse(project_id=project.id, signup_code=project.signup_code)
