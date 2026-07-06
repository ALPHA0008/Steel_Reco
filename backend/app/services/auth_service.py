from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system import User
from app.security import create_access_token, verify_password


class InvalidCredentials(Exception):
    pass


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
