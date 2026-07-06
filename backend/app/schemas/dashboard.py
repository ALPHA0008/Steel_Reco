from decimal import Decimal

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    period_label: str
    total_received_kg: Decimal
    total_issued_kg: Decimal
    total_scrap_sold_kg: Decimal
    wastage_pct: Decimal | None
