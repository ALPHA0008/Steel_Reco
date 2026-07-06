from fastapi import APIRouter, status

from app.dependencies import CurrentUser, ProjectScope, ScopedSession
from app.models.upstream import PurchaseOrder, QualityCheck, SupplierInvoice
from app.repositories.upstream_repository import (
    PurchaseOrderRepository,
    QualityCheckRepository,
    SupplierInvoiceRepository,
)
from app.schemas.upstream import (
    PurchaseOrderCreate,
    PurchaseOrderResponse,
    QualityCheckCreate,
    QualityCheckResponse,
    SupplierInvoiceCreate,
    SupplierInvoiceResponse,
)

router = APIRouter(prefix="/api/v1", tags=["upstream-documents"])

# Upstream documents (plan §3.5) are not booked to a ledger month themselves --
# unlike grn/store_issue/etc. they carry no effective_date and are never
# month-locked; only the GRN that eventually cites them is. They exist purely
# as Tier-1 anchors for the inbound-reconciliation rule.


@router.get("/purchase-orders", response_model=list[PurchaseOrderResponse])
async def list_purchase_orders(project_id: ProjectScope, session: ScopedSession) -> list[PurchaseOrderResponse]:
    items, _total = await PurchaseOrderRepository(session, project_id=project_id).list(limit=500)
    return [PurchaseOrderResponse.model_validate(p) for p in items]


@router.post("/purchase-orders", response_model=PurchaseOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    payload: PurchaseOrderCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> PurchaseOrderResponse:
    user_id, _role = current_user
    repo = PurchaseOrderRepository(session, project_id=project_id)
    po = PurchaseOrder(**payload.model_dump(exclude={"lines"}), created_by=user_id)
    await repo.add_with_lines(po, [line.model_dump() for line in payload.lines])
    await session.commit()
    return PurchaseOrderResponse.model_validate(po)


@router.get("/supplier-invoices", response_model=list[SupplierInvoiceResponse])
async def list_supplier_invoices(project_id: ProjectScope, session: ScopedSession) -> list[SupplierInvoiceResponse]:
    items, _total = await SupplierInvoiceRepository(session, project_id=project_id).list(limit=500)
    return [SupplierInvoiceResponse.model_validate(i) for i in items]


@router.post("/supplier-invoices", response_model=SupplierInvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier_invoice(
    payload: SupplierInvoiceCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> SupplierInvoiceResponse:
    user_id, _role = current_user
    repo = SupplierInvoiceRepository(session, project_id=project_id)
    invoice = SupplierInvoice(**payload.model_dump(exclude={"lines"}), created_by=user_id)
    await repo.add_with_lines(invoice, [line.model_dump() for line in payload.lines])
    await session.commit()
    return SupplierInvoiceResponse.model_validate(invoice)


@router.get("/quality-checks", response_model=list[QualityCheckResponse])
async def list_quality_checks(project_id: ProjectScope, session: ScopedSession) -> list[QualityCheckResponse]:
    items, _total = await QualityCheckRepository(session, project_id=project_id).list(limit=500)
    return [QualityCheckResponse.model_validate(q) for q in items]


@router.post("/quality-checks", response_model=QualityCheckResponse, status_code=status.HTTP_201_CREATED)
async def create_quality_check(
    payload: QualityCheckCreate, project_id: ProjectScope, current_user: CurrentUser, session: ScopedSession
) -> QualityCheckResponse:
    user_id, _role = current_user
    repo = QualityCheckRepository(session, project_id=project_id)
    qc = await repo.add(QualityCheck(**payload.model_dump(), created_by=user_id))
    await session.commit()
    return QualityCheckResponse.model_validate(qc)
