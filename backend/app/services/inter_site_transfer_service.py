import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BlockingRuleViolation, MonthLocked
from app.models.system import ExceptionLog
from app.models.transactions import InterSiteTransfer
from app.repositories.inter_site_transfer_repository import InterSiteTransferRepository
from app.repositories.masters_repository import RuleThresholdRepository
from app.repositories.month_lock_repository import MonthLockRepository
from app.repositories.stock_repository import StockRepository
from app.rules.base import RuleContext
from app.rules.engine import RulesEngine
from app.rules.registry import rules_engine
from app.schemas.transactions import InterSiteTransferCreate
from app.services.audit_service import AuditService


class InterSiteTransferService:
    """A loan-out transfer draws on the same store-wide pool as a store issue,
    so it runs transfer_exceeds_stock behind the same per-(project,dia)
    advisory lock and stock read that store_issue_service uses -- otherwise a
    transfer out could silently drive stock negative and feed the D>C
    'impossible' reconciliation the app exists to catch. Same
    lock -> read -> evaluate -> insert -> persist-exceptions -> audit shape.
    """

    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = InterSiteTransferRepository(session, project_id=project_id)
        self._stock = StockRepository(session)
        self._locks = MonthLockRepository(session)
        self._thresholds = RuleThresholdRepository(session)
        self._audit = AuditService(session)
        self._engine = rules_engine

    async def create(self, payload: InterSiteTransferCreate) -> tuple[InterSiteTransfer, str | None]:
        if await self._locks.is_finalized(
            self._project_id, payload.effective_date.year, payload.effective_date.month
        ):
            raise MonthLocked(payload.effective_date.year, payload.effective_date.month)

        # Serialize check-and-insert per (project, dia) against the same pool
        # store issues draw on -- read available stock inside the lock so a
        # concurrent issue/transfer can't race it.
        await self._stock.acquire_dia_lock(self._project_id, payload.dia_grade_id)
        available = await self._stock.available_qty(self._project_id, payload.dia_grade_id)

        mode = await self._thresholds.get_mode("transfer_exceeds_stock", self._project_id)
        ctx = RuleContext(
            project_id=self._project_id,
            transaction_type="inter_site_transfer",
            transaction_id=None,
            payload={
                "quantity_kg": payload.quantity_kg,
                "flag": payload.flag,
            },
            derived={"available_qty": available},
            thresholds={"transfer_exceeds_stock": {"mode": mode}} if mode is not None else {},
        )
        results = await self._engine.evaluate(ctx)

        blocking = RulesEngine.blocking_failures(results)
        if blocking:
            raise BlockingRuleViolation(blocking)

        transfer = InterSiteTransfer(
            **payload.model_dump(),
            from_project_id=self._project_id,
            created_by=self._user_id,
        )
        await self._repo.add(transfer)
        ctx.transaction_id = transfer.id

        warning: str | None = None
        for result in RulesEngine.advisory_failures(results):
            self._session.add(ExceptionLog(**result.to_exception_log_kwargs(ctx)))
            warning = result.message

        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="inter_site_transfer",
            row_id=transfer.id,
            action="CREATE",
            after_json={
                "to_project_id": str(transfer.to_project_id),
                "dia_grade_id": str(transfer.dia_grade_id),
                "quantity_kg": str(transfer.quantity_kg),
                "flag": transfer.flag,
            },
        )
        await self._session.commit()
        return transfer, warning
