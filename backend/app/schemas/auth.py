import uuid

from pydantic import BaseModel


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
