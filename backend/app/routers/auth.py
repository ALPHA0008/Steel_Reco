from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import CurrentUser
from app.models.system import ProjectAssignment, User
from app.schemas.auth import CurrentUserResponse, TokenResponse
from app.services.auth_service import InvalidCredentials, authenticate

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    try:
        token = await authenticate(session, username=form.username, password=form.password)
    except InvalidCredentials as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password") from exc
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
