from datetime import date

from pydantic import BaseModel


class SectionHealth(BaseModel):
    code: str  # "A".."N"
    label: str
    status: str  # "real" | "aggregate" | "synthetic" | "computed" | "stale"
    detail: str


class DataHealthResponse(BaseModel):
    generated_for_period: str  # "2026-04" -- the period these facts describe
    sections: list[SectionHealth]
    po_invoice_linkage_pct: float | None
    grn_total: int
    grn_linked: int
    open_exceptions: int
    total_exceptions: int
    earliest_activity: date | None
    latest_activity: date | None
