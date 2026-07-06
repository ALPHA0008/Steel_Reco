import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class PurchaseOrderLineCreate(BaseModel):
    dia_grade_id: uuid.UUID
    ordered_qty_kg: Decimal
    rate_per_kg: Decimal | None = None


class PurchaseOrderLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    dia_grade_id: uuid.UUID
    ordered_qty_kg: Decimal
    rate_per_kg: Decimal | None


class PurchaseOrderCreate(BaseModel):
    po_number: str
    vendor_id: uuid.UUID
    order_date: date
    status: str = "open"
    lines: list[PurchaseOrderLineCreate] = []


class PurchaseOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    po_number: str
    vendor_id: uuid.UUID
    order_date: date
    status: str
    created_by: uuid.UUID
    created_at: datetime
    lines: list[PurchaseOrderLineResponse] = []


class SupplierInvoiceLineCreate(BaseModel):
    dia_grade_id: uuid.UUID
    invoiced_qty_kg: Decimal
    rate_per_kg: Decimal | None = None


class SupplierInvoiceLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    dia_grade_id: uuid.UUID
    invoiced_qty_kg: Decimal
    rate_per_kg: Decimal | None


class SupplierInvoiceCreate(BaseModel):
    invoice_number: str
    vendor_id: uuid.UUID
    po_id: uuid.UUID | None = None
    invoice_date: date
    eway_bill_number: str | None = None
    vehicle_number: str | None = None
    lines: list[SupplierInvoiceLineCreate] = []


class SupplierInvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    invoice_number: str
    vendor_id: uuid.UUID
    po_id: uuid.UUID | None
    invoice_date: date
    eway_bill_number: str | None
    vehicle_number: str | None
    created_by: uuid.UUID
    created_at: datetime
    lines: list[SupplierInvoiceLineResponse] = []


class QualityCheckCreate(BaseModel):
    grn_id: uuid.UUID
    mtc_number: str | None = None
    grade: str | None = None
    accepted_qty_kg: Decimal
    rejected_qty_kg: Decimal = Decimal("0")
    remarks: str | None = None


class QualityCheckResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    grn_id: uuid.UUID
    mtc_number: str | None
    grade: str | None
    accepted_qty_kg: Decimal
    rejected_qty_kg: Decimal
    remarks: str | None
    created_by: uuid.UUID
    created_at: datetime
