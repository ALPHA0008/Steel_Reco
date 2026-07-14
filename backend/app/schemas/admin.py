import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    project_id: uuid.UUID | None
    project_name: str | None


class AdminAuditEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    table_name: str
    row_id: uuid.UUID | None
    project_id: uuid.UUID | None
    created_at: datetime


class SetSignupCodeRequest(BaseModel):
    """signup_code is optional: omit it to have the server generate a strong
    random one (recommended -- an admin hand-typing a code tends to pick
    something short/guessable like a site name or "1234")."""

    signup_code: str | None = None

    @field_validator("signup_code")
    @classmethod
    def _valid_code(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not (6 <= len(v) <= 32):
            raise ValueError("signup_code must be 6-32 characters")
        return v


class SignupCodeResponse(BaseModel):
    project_id: uuid.UUID
    signup_code: str
