import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BlockingRuleViolation, MonthLocked
from app.models.system import ExceptionLog
from app.models.transactions import StoreIssue
from app.repositories.masters_repository import RuleThresholdRepository
from app.repositories.month_lock_repository import MonthLockRepository
from app.repositories.stock_repository import StockRepository
from app.repositories.store_issue_repository import StoreIssueRepository
from app.rules.base import RuleContext
from app.rules.engine import RulesEngine
from app.rules.registry import rules_engine
from app.schemas.transactions import StoreIssueCreate
from app.services.audit_service import AuditService


class StoreIssueService:
    """The invariant (plan §5.3). Stock is a shared store-wide pool per
    project+dia, never per-contractor (confirmed with My Home store
    management) -- the advisory lock and stock read below are keyed on
    (project_id, dia_grade_id) only.
    """

    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._issues = StoreIssueRepository(session, project_id=project_id)
        self._stock = StockRepository(session)
        self._locks = MonthLockRepository(session)
        self._thresholds = RuleThresholdRepository(session)
        self._audit = AuditService(session)
        self._engine = rules_engine

    async def create(self, payload: StoreIssueCreate) -> tuple[StoreIssue, str | None]:
        # 1. month lock -- checked before anything else, per every write path
        if await self._locks.is_finalized(
            self._project_id, payload.effective_date.year, payload.effective_date.month
        ):
            raise MonthLocked(payload.effective_date.year, payload.effective_date.month)

        # 2. serialize the check-and-insert per (project, dia) -- shared pool,
        #    not per-contractor. pg_advisory_xact_lock auto-releases at commit.
        await self._stock.acquire_dia_lock(self._project_id, payload.dia_grade_id)

        # 3. read available stock INSIDE the lock (snapshot-consistent within this txn)
        available = await self._stock.available_qty(self._project_id, payload.dia_grade_id)

        # 4. run rules with the freshly-read derived value. mode is looked up
        #    from rule_thresholds (project override, else global default, else
        #    the rule's own default_mode) -- this is the "no deploy" flip point
        #    for promoting issue_exceeds_stock from advisory to blocking (plan §5.3).
        mode = await self._thresholds.get_mode("issue_exceeds_stock", self._project_id)
        ctx = RuleContext(
            project_id=self._project_id,
            transaction_type="store_issue",
            transaction_id=None,
            payload={"quantity_kg": payload.quantity_kg},
            derived={"available_qty": available},
            thresholds={"mode": mode} if mode is not None else {},
        )
        results = await self._engine.evaluate(ctx)

        # 5. blocking mode (Phase 3+ promotion via rule_thresholds) aborts the write
        blocking = RulesEngine.blocking_failures(results)
        if blocking:
            raise BlockingRuleViolation(blocking)

        # 6. insert the issue + persist any advisory exceptions + audit, all in
        #    the same transaction as the lock and the stock read above
        issue = StoreIssue(**payload.model_dump(), created_by=self._user_id)
        await self._issues.add(issue)
        ctx.transaction_id = issue.id  # now known; used for the exception_log FK below

        warning: str | None = None
        for result in RulesEngine.advisory_failures(results):
            self._session.add(ExceptionLog(**result.to_exception_log_kwargs(ctx)))
            warning = result.message

        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="store_issue",
            row_id=issue.id,
            action="CREATE",
            after_json={
                "contractor_id": str(issue.contractor_id),
                "dia_grade_id": str(issue.dia_grade_id),
                "quantity_kg": str(issue.quantity_kg),
                "direction": issue.direction,
            },
        )

        await self._session.commit()
        return issue, warning
