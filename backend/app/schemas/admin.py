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


# ---- Admin multi-site dashboard ----

from decimal import Decimal  # noqa: E402


class AdminSiteSummary(BaseModel):
    """One row/card in the admin's all-sites overview -- the site plus its
    current headline numbers and a compact wastage sparkline, so the dashboard
    shows real figures (and a mini trend) without a per-site round-trip."""

    project_id: uuid.UUID
    name: str
    location: str | None
    status: str
    contract_wastage_pct: Decimal
    period_label: str | None = None
    total_received_kg: Decimal = Decimal("0")
    total_issued_kg: Decimal = Decimal("0")
    total_scrap_sold_kg: Decimal = Decimal("0")
    wastage_pct: Decimal | None = None
    over_cap: bool = False
    open_exceptions: int = 0
    # Compact per-month wastage % for a card sparkline (nulls dropped). Empty
    # when the site has no month-by-month wastage history yet.
    wastage_spark: list[float] = []


class AdminMasterSummary(BaseModel):
    """Company-wide roll-up across every real site."""

    site_count: int
    sites_over_cap: int
    total_received_kg: Decimal
    total_issued_kg: Decimal
    total_scrap_sold_kg: Decimal
    open_exceptions: int
    weighted_wastage_pct: Decimal | None  # Sigma L / Sigma G across sites
