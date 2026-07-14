from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import CurrentUser
from app.models.system import ProjectAssignment, User
from app.rate_limit import client_ip, login_rate_limiter, signup_rate_limiter
from app.schemas.auth import CurrentUserResponse, SignupRequest, TokenResponse
from app.services.auth_service import (
    AccountAlreadyExists,
    InvalidCredentials,
    InvalidSignupCode,
    authenticate,
    signup as signup_user,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    login_rate_limiter.check(f"login:{client_ip(request)}:{form.username}")
    try:
        token = await authenticate(session, username=form.username, password=form.password)
    except InvalidCredentials as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password") from exc
    return TokenResponse(access_token=token)


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    request: Request,
    payload: SignupRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Self-service QS signup, gated by the target project's signup code
    (plan: no admin-approval step; the code is the gate). Logs the new user
    in immediately on success, matching /login's response shape.
    """
    signup_rate_limiter.check(f"signup:{client_ip(request)}")
    try:
        token = await signup_user(session, payload)
    except InvalidSignupCode as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid project or signup code") from exc
    except AccountAlreadyExists as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "That username or email is already registered") from exc
    return TokenResponse(access_token=token)


@router.get("/me", response_model=CurrentUserResponse)
async def me(current_user: CurrentUser, session: AsyncSession = Depends(get_session)) -> CurrentUserResponse:
    user_id, role = current_user
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    project_id = None
    if role != "admin":
        # Reuse verify_project_access's lookup logic via a direct call is awkward
        # here since it depends on a scoped session; a plain lookup is simplest.
        pa_result = await session.execute(
            select(ProjectAssignment.project_id).where(
                ProjectAssignment.user_id == user_id, ProjectAssignment.is_primary.is_(True)
            )
        )
        project_id = pa_result.scalar_one_or_none()

    return CurrentUserResponse(
        id=user.id, username=user.username, full_name=user.full_name, role=user.role, project_id=project_id
    )
