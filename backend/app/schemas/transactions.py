import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, model_validator


class GrnCreate(BaseModel):
    vendor_id: uuid.UUID
    dia_grade_id: uuid.UUID
    po_reference: str | None = None
    weighbridge_weight_kg: Decimal
    receipt_type: str  # against_po | other_site_sap | other_site_excel
    source_site: str | None = None
    gate_entry_at: datetime
    slip_photo_uri: str | None = None
    notes: str | None = None
    # Upstream linkage (plan §3.5) -- all optional. Omitting them still saves
    # the GRN; the inbound-reconciliation rule just has nothing to check
    # against and flags it, per the trust-tier model.
    po_id: uuid.UUID | None = None
    supplier_invoice_id: uuid.UUID | None = None
    gross_weight_kg: Decimal | None = None
    tare_weight_kg: Decimal | None = None

    @model_validator(mode="after")
    def _other_site_requires_source(self) -> "GrnCreate":
        if self.receipt_type in ("other_site_sap", "other_site_excel") and not self.source_site:
            raise ValueError("source_site is required when receipt_type is other_site_sap or other_site_excel")
        return self


class GrnResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    vendor_id: uuid.UUID
    dia_grade_id: uuid.UUID
    po_reference: str | None
    weighbridge_weight_kg: Decimal
    receipt_type: str
    source_site: str | None
    gate_entry_at: datetime
    effective_date: date
    slip_photo_uri: str | None
    notes: str | None
    corrected_from_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime
    po_id: uuid.UUID | None
    supplier_invoice_id: uuid.UUID | None
    gross_weight_kg: Decimal | None
    tare_weight_kg: Decimal | None
    # populated when the inbound-reconciliation rule fires (advisory, plan §3.5)
    warning: str | None = None


class StoreIssueCreate(BaseModel):
    contractor_id: uuid.UUID
    dia_grade_id: uuid.UUID
    quantity_kg: Decimal
    direction: str = "out"  # out | in (return to store)
    issuing_staff: str | None = None
    effective_date: date


class StoreIssueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    contractor_id: uuid.UUID
    dia_grade_id: uuid.UUID
    quantity_kg: Decimal
    direction: str
    issuing_staff: str | None
    effective_date: date
    corrected_from_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime
    warning: str | None = None  # populated when an advisory rule fired (PRD story 15)


class InterSiteTransferCreate(BaseModel):
    to_project_id: uuid.UUID
    dia_grade_id: uuid.UUID
    quantity_kg: Decimal
    flag: str  # loan | return
    record_source: str  # sap | excel
    ho_approval_ref: str | None = None
    expected_return_date: date | None = None
    effective_date: date


class InterSiteTransferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    from_project_id: uuid.UUID
    to_project_id: uuid.UUID
    dia_grade_id: uuid.UUID
    quantity_kg: Decimal
    flag: str
    record_source: str
    ho_approval_ref: str | None
    expected_return_date: date | None
    actual_return_date: date | None
    effective_date: date
    corrected_from_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime


class BbsPlanCreate(BaseModel):
    tower_id: uuid.UUID
    floor_id: uuid.UUID
    element_id: uuid.UUID | None = None
    bar_mark: str | None = None
    pour_description: str | None = None
    dia_grade_id: uuid.UUID
    planned_weight_kg: Decimal
    drawing_ref: str | None = None
    contractor_id: uuid.UUID | None = None


class BbsPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    tower_id: uuid.UUID
    floor_id: uuid.UUID
    element_id: uuid.UUID | None
    bar_mark: str | None
    pour_description: str | None
    dia_grade_id: uuid.UUID
    planned_weight_kg: Decimal
    drawing_ref: str | None
    contractor_id: uuid.UUID | None
    corrected_from_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime


class JmrActualCreate(BaseModel):
    tower_id: uuid.UUID
    floor_id: uuid.UUID
    element_id: uuid.UUID | None = None
    bar_mark: str | None = None
    dia_grade_id: uuid.UUID
    measured_weight_kg: Decimal
    contractor_id: uuid.UUID | None = None
    pour_number: str | None = None
    drawing_ref: str | None = None
    effective_date: date


class JmrActualResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    tower_id: uuid.UUID
    floor_id: uuid.UUID
    element_id: uuid.UUID | None
    bar_mark: str | None
    dia_grade_id: uuid.UUID
    measured_weight_kg: Decimal
    contractor_id: uuid.UUID | None
    pour_number: str | None
    drawing_ref: str | None
    effective_date: date
    corrected_from_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime


class CutPieceCreate(BaseModel):
    length_mm: int
    nos: int
    weight_kg: Decimal
    classification: str  # reusable | used_as_safety_steel | scrap

    @model_validator(mode="after")
    def _scrap_rule(self) -> "CutPieceCreate":
        """Client-side mirror of the DB scrap_rule CHECK (plan §3.2) -- the
        DB constraint is the real enforcement; this just gives a clean 422
        instead of a raw IntegrityError for the common case."""
        if self.length_mm <= 1500 and self.classification != "scrap":
            raise ValueError("cut pieces <= 1500mm must be classified as scrap")
        return self


class PhysicalCountCreate(BaseModel):
    contractor_id: uuid.UUID
    dia_grade_id: uuid.UUID
    bundle_count: int = 0
    each_bundle_weight_kg: Decimal | None = None
    loose_rod_count: int = 0
    each_rod_weight_kg: Decimal | None = None
    photo_uri: str | None = None
    effective_date: date
    notes: str | None = None
    cut_pieces: list[CutPieceCreate] = []


class CutPieceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    length_mm: int
    nos: int
    weight_kg: Decimal
    classification: str


class PhysicalCountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    contractor_id: uuid.UUID
    dia_grade_id: uuid.UUID
    bundle_count: int
    each_bundle_weight_kg: Decimal | None
    loose_rod_count: int
    each_rod_weight_kg: Decimal | None
    photo_uri: str | None
    effective_date: date
    notes: str | None
    corrected_from_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime
    cut_pieces: list[CutPieceResponse] = []


class ScrapSaleCreate(BaseModel):
    buyer_name: str
    weight_kg: Decimal
    rate_per_kg: Decimal
    gate_pass_no: str | None = None
    invoice_ref: str | None = None
    effective_date: date
    notes: str | None = None


class ScrapSaleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    buyer_name: str
    weight_kg: Decimal
    rate_per_kg: Decimal
    total_amount: Decimal
    gate_pass_no: str | None
    invoice_ref: str | None
    effective_date: date
    notes: str | None
    corrected_from_id: uuid.UUID | None
    created_by: uuid.UUID
    created_at: datetime
