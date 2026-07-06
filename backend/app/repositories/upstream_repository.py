import uuid
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.orm import selectinload

from app.models.upstream import (
    PurchaseOrder,
    PurchaseOrderLine,
    QualityCheck,
    SupplierInvoice,
    SupplierInvoiceLine,
)
from app.repositories.base import BaseRepository


class PurchaseOrderRepository(BaseRepository[PurchaseOrder]):
    model = PurchaseOrder
    # Same reasoning as PhysicalCountRepository.eager_options: async SQLAlchemy
    # cannot lazy-load `.lines` outside the request's greenlet, so it must be
    # eager on every read path, including the empty-list case.
    eager_options = (selectinload(PurchaseOrder.lines),)

    async def add_with_lines(self, instance: PurchaseOrder, lines: list[dict]) -> PurchaseOrder:
        if self.project_id is not None:
            instance.project_id = self.project_id
        instance.lines = [
            PurchaseOrderLine(
                project_id=instance.project_id,
                dia_grade_id=line["dia_grade_id"],
                ordered_qty_kg=line["ordered_qty_kg"],
                rate_per_kg=line.get("rate_per_kg"),
            )
            for line in lines
        ]
        self.session.add(instance)
        await self.session.flush()
        return instance

    async def ordered_qty_kg(self, po_id: uuid.UUID, dia_grade_id: uuid.UUID) -> Decimal:
        """Sum ordered_qty_kg for one PO+dia -- the PO-discipline check compares
        this to cumulative accepted GRN qty (plan §3.5's Sigma GRN <= PO line)."""
        result = await self.session.execute(
            text(
                "SELECT COALESCE(SUM(ordered_qty_kg), 0) AS total "
                "FROM purchase_order_line WHERE po_id = :po_id AND dia_grade_id = :dia"
            ),
            {"po_id": po_id, "dia": dia_grade_id},
        )
        return result.scalar_one()


class SupplierInvoiceRepository(BaseRepository[SupplierInvoice]):
    model = SupplierInvoice
    eager_options = (selectinload(SupplierInvoice.lines),)

    async def add_with_lines(self, instance: SupplierInvoice, lines: list[dict]) -> SupplierInvoice:
        if self.project_id is not None:
            instance.project_id = self.project_id
        instance.lines = [
            SupplierInvoiceLine(
                project_id=instance.project_id,
                dia_grade_id=line["dia_grade_id"],
                invoiced_qty_kg=line["invoiced_qty_kg"],
                rate_per_kg=line.get("rate_per_kg"),
            )
            for line in lines
        ]
        self.session.add(instance)
        await self.session.flush()
        return instance

    async def invoiced_qty_kg(self, invoice_id: uuid.UUID, dia_grade_id: uuid.UUID) -> Decimal:
        """Total invoiced qty for one invoice+dia -- compared against the GRN's
        (gross - tare) and weighbridge_weight_kg in the inbound-reconciliation
        rule (plan §3.5)."""
        result = await self.session.execute(
            text(
                "SELECT COALESCE(SUM(invoiced_qty_kg), 0) AS total "
                "FROM supplier_invoice_line WHERE invoice_id = :invoice_id AND dia_grade_id = :dia"
            ),
            {"invoice_id": invoice_id, "dia": dia_grade_id},
        )
        return result.scalar_one()


class QualityCheckRepository(BaseRepository[QualityCheck]):
    model = QualityCheck
