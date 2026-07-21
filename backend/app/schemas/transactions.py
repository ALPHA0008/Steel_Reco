import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class GrnCreate(BaseModel):
    vendor_id: uuid.UUID
    dia_grade_id: uuid.UUID
    po_reference: str | None = None
    weighbridge_weight_kg: Decimal = Field(gt=0)
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
    gross_weight_kg: Decimal | None = Field(default=None, gt=0)
    tare_weight_kg: Decimal | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _other_site_requires_source(self) -> "GrnCreate":
        if self.receipt_type in ("other_site_sap", "other_site_excel") and not self.source_site:
            raise ValueError("source_site is required when receipt_type is other_site_sap or other_site_excel")
        return self

    @model_validator(mode="after")
    def _tare_below_gross(self) -> "GrnCreate":
        """Mirror of the ck_grn_tare_below_gross DB CHECK -- a tare heavier
        than gross means a negative net, which the inbound-reconciliation rule
        would then compare nonsensically against the weighbridge net."""
        if (
            self.gross_weight_kg is not None
            and self.tare_weight_kg is not None
            and self.tare_weight_kg >= self.gross_weight_kg
        ):
            raise ValueError("tare_weight_kg must be less than gross_weight_kg")
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


class GrnPoSummaryRow(BaseModel):
    """One row per distinct po_reference text -- surfaces receiving structure
    honestly while no real PO master data is linked (see po_reference_summary)."""

    po_reference: str
    grn_count: int
    total_kg: Decimal
    first_date: date
    last_date: date
    linked_count: int  # of grn_count, how many have a real po_id FK (today: always 0)


class StoreIssueCreate(BaseModel):
    contractor_id: uuid.UUID
    dia_grade_id: uuid.UUID
    quantity_kg: Decimal = Field(gt=0)
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
    quantity_kg: Decimal = Field(gt=0)
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
    warning: str | None = None  # populated when transfer_exceeds_stock fired (advisory)


class BbsPlanCreate(BaseModel):
    tower_id: uuid.UUID
    floor_id: uuid.UUID
    element_id: uuid.UUID | None = None
    bar_mark: str | None = None
    pour_description: str | None = None
    dia_grade_id: uuid.UUID
    planned_weight_kg: Decimal = Field(gt=0)
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
    measured_weight_kg: Decimal = Field(gt=0)
    contractor_id: uuid.UUID | None = None
    pour_number: str | None = None
    drawing_ref: str | None = None
    effective_date: date
    # Set when this entry re-states (supersedes) an earlier one. The original
    # is kept for audit but excluded from every sum -- Abstract E, the BBS
    # cumulative check, and the duplicate-pour count all read active rows only.
    corrected_from_id: uuid.UUID | None = None


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
    warning: str | None = None  # populated when an advisory rule fired (PRD story 15)


class CutPieceCreate(BaseModel):
    length_mm: int = Field(gt=0)
    nos: int = Field(gt=0)
    weight_kg: Decimal = Field(gt=0)
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
    bundle_count: int = Field(default=0, ge=0)
    each_bundle_weight_kg: Decimal | None = Field(default=None, gt=0)
    loose_rod_count: int = Field(default=0, ge=0)
    each_rod_weight_kg: Decimal | None = Field(default=None, gt=0)
    photo_uri: str | None = None
    effective_date: date
    notes: str | None = None
    cut_pieces: list[CutPieceCreate] = []

    @model_validator(mode="after")
    def _weight_required_when_counted(self) -> "PhysicalCountCreate":
        """A bundle/rod count with no per-unit weight contributes 0 to Section I
        (the query multiplies count x weight), silently under-stating physical
        stock and inflating apparent wastage. Mirror the frontend's own check."""
        if self.bundle_count > 0 and self.each_bundle_weight_kg is None:
            raise ValueError("each_bundle_weight_kg is required when bundle_count > 0")
        if self.loose_rod_count > 0 and self.each_rod_weight_kg is None:
            raise ValueError("each_rod_weight_kg is required when loose_rod_count > 0")
        return self


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
    buyer_name: str = Field(min_length=1)
    weight_kg: Decimal = Field(gt=0)
    rate_per_kg: Decimal = Field(ge=0)
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
