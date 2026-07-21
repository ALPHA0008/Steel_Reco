import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import (
    AlreadyCorrected,
    BlockingRuleViolation,
    CorrectionScopeMismatch,
    MonthLocked,
    NotFoundError,
)
from app.models.system import ExceptionLog
from app.models.transactions import JmrActual
from app.repositories.bbs_plan_repository import BbsPlanRepository
from app.repositories.jmr_actual_repository import JmrActualRepository
from app.repositories.masters_repository import RuleThresholdRepository
from app.repositories.month_lock_repository import MonthLockRepository
from app.rules.base import RuleContext
from app.rules.engine import RulesEngine
from app.rules.registry import rules_engine
from app.schemas.transactions import JmrActualCreate
from app.services.audit_service import AuditService


class JmrActualService:
    """Runs jmr_exceeds_bbs_plan and duplicate_pour_entry (the 2026-07
    manipulation-catching reframing) before every JMR write -- same
    lock -> derive -> evaluate -> insert -> persist-exceptions -> audit shape
    as store_issue_service's stock invariant.
    """

    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = JmrActualRepository(session, project_id=project_id)
        self._bbs = BbsPlanRepository(session, project_id=project_id)
        self._locks = MonthLockRepository(session)
        self._thresholds = RuleThresholdRepository(session)
        self._audit = AuditService(session)
        self._engine = rules_engine

    async def create(self, payload: JmrActualCreate) -> tuple[JmrActual, str | None]:
        if await self._locks.is_finalized(
            self._project_id, payload.effective_date.year, payload.effective_date.month
        ):
            raise MonthLocked(payload.effective_date.year, payload.effective_date.month)

        # Correction link: the referenced row must exist in this project and
        # must not already have a correction -- chains (A<-B<-C) are allowed,
        # forks (B and C both re-stating A) are not, since a fork would leave
        # two "active" replacements both counting in the Abstract.
        if payload.corrected_from_id is not None:
            original = await self._repo.get(payload.corrected_from_id)
            if original is None:
                raise NotFoundError(f"jmr_actual {payload.corrected_from_id} not found")
            existing_correction = await self._repo.superseded_by(payload.corrected_from_id)
            if existing_correction is not None:
                raise AlreadyCorrected(str(payload.corrected_from_id), str(existing_correction))

            # The ORIGINAL's period must be open too, not just the correction's
            # own date. Superseding is retroactive -- the original stops
            # counting the moment the correction lands, so a correction dated
            # into an open month would silently rewrite an already-finalized
            # Abstract without Reopen. Lock check on both ends closes that.
            if await self._locks.is_finalized(
                self._project_id, original.effective_date.year, original.effective_date.month
            ):
                raise MonthLocked(original.effective_date.year, original.effective_date.month)

            # A correction re-states the measurement, never what was measured.
            # Letting scope drift would let "Correct" vanish one entry and
            # substitute an unrelated one under a correction's audit label.
            for field in ("tower_id", "floor_id", "element_id", "dia_grade_id", "contractor_id"):
                orig_val, new_val = getattr(original, field), getattr(payload, field)
                if orig_val != new_val:
                    raise CorrectionScopeMismatch(field, str(orig_val), str(new_val))

        # Pre-fetch every value both rules need, inside this transaction (same
        # shape as grn_service's anchor pre-fetch) -- the rules themselves do
        # no DB I/O and stay pure/unit-testable.
        derived: dict = {}
        if payload.element_id is not None:
            planned = await self._bbs.sum_planned_weight_kg(payload.element_id, payload.dia_grade_id)
            # exclude the row being corrected: it's still "active" until this
            # correction is inserted, and its weight is being replaced, not
            # added to -- see sum_measured_weight_kg's docstring.
            prior_measured = await self._repo.sum_measured_weight_kg(
                payload.element_id, payload.dia_grade_id, exclude_id=payload.corrected_from_id
            )
            derived["bbs_planned_weight_kg"] = planned
            derived["cumulative_measured_weight_kg"] = prior_measured + payload.measured_weight_kg
            derived["existing_jmr_count_for_element"] = await self._repo.count_for_element(payload.element_id)

        bbs_mode = await self._thresholds.get_mode("jmr_exceeds_bbs_plan", self._project_id)
        bbs_tolerance = await self._thresholds.get_value(
            "jmr_exceeds_bbs_plan", self._project_id, "tolerance_pct"
        )
        dup_mode = await self._thresholds.get_mode("duplicate_pour_entry", self._project_id)
        bbs_thresholds: dict = {}
        if bbs_mode is not None:
            bbs_thresholds["mode"] = bbs_mode
        if bbs_tolerance is not None:
            bbs_thresholds["tolerance_pct"] = bbs_tolerance
        ctx = RuleContext(
            project_id=self._project_id,
            transaction_type="jmr_actual",
            transaction_id=None,
            payload={
                "element_id": payload.element_id,
                "corrected_from_id": payload.corrected_from_id,
                "measured_weight_kg": payload.measured_weight_kg,
            },
            derived=derived,
            thresholds={
                "jmr_exceeds_bbs_plan": bbs_thresholds,
                "duplicate_pour_entry": {"mode": dup_mode} if dup_mode is not None else {},
            },
        )
        results = await self._engine.evaluate(ctx)

        blocking = RulesEngine.blocking_failures(results)
        if blocking:
            raise BlockingRuleViolation(blocking)

        actual = JmrActual(**payload.model_dump(), created_by=self._user_id)
        await self._repo.add(actual)
        ctx.transaction_id = actual.id

        warning: str | None = None
        for result in RulesEngine.advisory_failures(results):
            self._session.add(ExceptionLog(**result.to_exception_log_kwargs(ctx)))
            warning = result.message

        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="jmr_actual",
            row_id=actual.id,
            action="CORRECT" if actual.corrected_from_id else "CREATE",
            after_json={
                "tower_id": str(actual.tower_id),
                "floor_id": str(actual.floor_id),
                "dia_grade_id": str(actual.dia_grade_id),
                "measured_weight_kg": str(actual.measured_weight_kg),
                "corrected_from_id": str(actual.corrected_from_id) if actual.corrected_from_id else None,
            },
        )
        await self._session.commit()
        return actual, warning
