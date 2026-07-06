import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BlockingRuleViolation, MonthLocked
from app.models.system import ExceptionLog
from app.models.transactions import Grn
from app.repositories.grn_repository import GrnRepository
from app.repositories.masters_repository import RuleThresholdRepository
from app.repositories.month_lock_repository import MonthLockRepository
from app.repositories.upstream_repository import PurchaseOrderRepository, SupplierInvoiceRepository
from app.rules.base import RuleContext
from app.rules.engine import RulesEngine
from app.rules.registry import rules_engine
from app.schemas.transactions import GrnCreate
from app.services.audit_service import AuditService


class GrnService:
    """First transaction service (plan §9). Since the 2026-07 upstream-docs
    reframing (plan §3.5), also runs the inbound-reconciliation rule -- the
    GRN is no longer a trusted entry point, only trusted for the frozen
    historical back-test. Write-path shape (lock -> insert -> audit) is
    unchanged; the rule step slots in exactly like store_issue's invariant.
    """

    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = GrnRepository(session, project_id=project_id)
        self._pos = PurchaseOrderRepository(session, project_id=project_id)
        self._invoices = SupplierInvoiceRepository(session, project_id=project_id)
        self._locks = MonthLockRepository(session)
        self._thresholds = RuleThresholdRepository(session)
        self._audit = AuditService(session)
        self._engine = rules_engine

    async def create(self, payload: GrnCreate) -> tuple[Grn, str | None]:
        effective_date = payload.gate_entry_at.date()
        if await self._locks.is_finalized(self._project_id, effective_date.year, effective_date.month):
            raise MonthLocked(effective_date.year, effective_date.month)

        # Pre-fetch every anchor the rule might check, inside this transaction
        # (same shape as store_issue_service's stock read) -- the rule itself
        # does no DB I/O and stays pure/unit-testable.
        derived: dict = {
            "gross_weight_kg": payload.gross_weight_kg,
            "tare_weight_kg": payload.tare_weight_kg,
        }
        if payload.supplier_invoice_id is not None:
            derived["invoiced_qty_kg"] = await self._invoices.invoiced_qty_kg(
                payload.supplier_invoice_id, payload.dia_grade_id
            )
        if payload.po_id is not None:
            derived["po_id"] = payload.po_id
            derived["ordered_qty_kg"] = await self._pos.ordered_qty_kg(payload.po_id, payload.dia_grade_id)
            # cumulative accepted so far against this PO+dia, plus this GRN's own qty
            existing = await self._repo.cumulative_accepted_kg(payload.po_id, payload.dia_grade_id)
            derived["cumulative_accepted_kg"] = existing + payload.weighbridge_weight_kg

        mode = await self._thresholds.get_mode("inbound_reconciliation", self._project_id)
        ctx = RuleContext(
            project_id=self._project_id,
            transaction_type="grn",
            transaction_id=None,
            payload={"weighbridge_weight_kg": payload.weighbridge_weight_kg},
            derived=derived,
            thresholds={"mode": mode} if mode is not None else {},
        )
        results = await self._engine.evaluate(ctx)

        blocking = RulesEngine.blocking_failures(results)
        if blocking:
            raise BlockingRuleViolation(blocking)

        grn = Grn(
            **payload.model_dump(exclude={"gate_entry_at"}),
            gate_entry_at=payload.gate_entry_at,
            effective_date=effective_date,
            created_by=self._user_id,
        )
        await self._repo.add(grn)
        ctx.transaction_id = grn.id

        warning: str | None = None
        for result in RulesEngine.advisory_failures(results):
            self._session.add(ExceptionLog(**result.to_exception_log_kwargs(ctx)))
            warning = result.message

        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="grn",
            row_id=grn.id,
            action="CREATE",
            after_json={
                "vendor_id": str(grn.vendor_id),
                "dia_grade_id": str(grn.dia_grade_id),
                "weighbridge_weight_kg": str(grn.weighbridge_weight_kg),
                "receipt_type": grn.receipt_type,
            },
        )
        await self._session.commit()
        return grn, warning
