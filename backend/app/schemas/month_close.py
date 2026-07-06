import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class FinalizeRequest(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)


class FinalizeResponse(BaseModel):
    finalized_month_id: uuid.UUID
    snapshot_id: uuid.UUID
    status: str
    year: int
    month: int
    finalized_at: datetime


class ReopenRequest(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    reason: str = Field(min_length=1)  # PRD story 20: non-empty reason required
