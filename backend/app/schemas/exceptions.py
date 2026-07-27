import uuid
from datetime import date, datetime
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
    # Validation state (migration 0011): when a follow-up was promised for,
    # how the resolution was proven ('verified' = the rule was re-run and now
    # passes, 'accepted' = explicit human override, 'pending' = awaiting the
    # follow-up date), and how many times an overdue promise has bounced back.
    follow_up_due_date: date | None = None
    validation_state: str | None = None
    validated_at: datetime | None = None
    reopened_count: int = 0


class ExceptionResolveRequest(BaseModel):
    resolution_type: str = Field(pattern="^(approved|corrected|follow_up)$")
    reason: str = Field(min_length=1)
    # Required for follow_up (enforced in the service, which also bounds how far
    # out it may be); ignored for approved/corrected.
    follow_up_due_date: date | None = None
