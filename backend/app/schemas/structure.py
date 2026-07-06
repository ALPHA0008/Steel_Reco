import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class ProjectCreate(BaseModel):
    name: str
    location: str | None = None
    contract_wastage_pct: Decimal = Decimal("3.00")


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    location: str | None
    status: str
    contract_wastage_pct: Decimal
    created_at: datetime


class TowerCreate(BaseModel):
    name: str
    sequence: int = 0


class TowerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    sequence: int


class FloorCreate(BaseModel):
    tower_id: uuid.UUID
    level_name: str
    sequence: int = 0


class FloorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    tower_id: uuid.UUID
    level_name: str
    sequence: int


class ElementCreate(BaseModel):
    tower_id: uuid.UUID
    floor_id: uuid.UUID
    element_type: str
    name: str


class ElementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    tower_id: uuid.UUID
    floor_id: uuid.UUID
    element_type: str
    name: str
