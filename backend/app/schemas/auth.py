import re
import uuid

from pydantic import BaseModel, EmailStr, field_validator

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,50}$")


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUserResponse(BaseModel):
    id: uuid.UUID
    username: str
    full_name: str
    role: str
    project_id: uuid.UUID | None  # the QS's assigned project (PRD story 22); None for admin


class SignupRequest(BaseModel):
    """Self-service QS signup (no admin approval step). Gated by the target
    project's signup_code, not by anything the server can trust the client to
    have already verified -- the service re-checks the code against the DB.
    """

    username: str
    email: EmailStr
    password: str
    full_name: str
    project_id: uuid.UUID
    signup_code: str

    @field_validator("username")
    @classmethod
    def _valid_username(cls, v: str) -> str:
        if not _USERNAME_RE.match(v):
            raise ValueError("username must be 3-50 characters: letters, numbers, underscore, dot, or hyphen")
        return v

    @field_validator("password")
    @classmethod
    def _valid_password(cls, v: str) -> str:
        # bcrypt silently truncates at 72 bytes (app.security._MAX_PASSWORD_BYTES);
        # reject weak/oversized passwords here rather than let hash_password's
        # own ValueError surface as an unhandled 500 mid-signup.
        if len(v) < 8:
            raise ValueError("password must be at least 8 characters")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("password must be at most 72 bytes")
        return v

    @field_validator("full_name")
    @classmethod
    def _valid_full_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 255):
            raise ValueError("full_name must be 1-255 characters")
        return v
