import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExceptionLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    rule_name: str
    severity: str
    transaction_table: str | None
    transaction_id: uuid.UUID | None
    threshold_value: Decimal | None
    actual_value: Decimal | None
    message: str | None
    status: str
    resolution_type: str | None
    resolver_reason: str | None
    resolved_by: uuid.UUID | None
    resolved_at: datetime | None
    created_at: datetime


class ExceptionResolveRequest(BaseModel):
    resolution_type: str = Field(pattern="^(approved|corrected|follow_up)$")
    reason: str = Field(min_length=1)
