import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class VendorCreate(BaseModel):
    name: str
    gst: str | None = None


class VendorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    gst: str | None
    is_active: bool
    created_at: datetime


class ContractorCreate(BaseModel):
    code: str
    name: str


class ContractorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    is_active: bool
    created_at: datetime


class DiaGradeCreate(BaseModel):
    diameter_mm: Decimal
    grade: str = "Fe500"
    unit_weight_kg_per_m: Decimal


class DiaGradeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    diameter_mm: Decimal
    grade: str
    unit_weight_kg_per_m: Decimal
    is_active: bool
    created_at: datetime
