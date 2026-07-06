import hashlib
import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import DomainError
from app.models.system import FinalizedMonth
from app.models.transactions import MonthlyAbstractSnapshot
from app.repositories.finalized_month_repository import FinalizedMonthRepository
from app.repositories.snapshot_repository import SnapshotRepository
from app.schemas.month_close import FinalizeResponse
from app.services.abstract_service import AbstractService
from app.services.audit_service import AuditService


class AlreadyFinalized(DomainError):
    """A second finalize for the same period. -> HTTP 409 (unique constraint
    on finalized_month(project_id, year, month) is the real enforcement,
    plan §5.5)."""

    def __init__(self, year: int, month: int):
        super().__init__(f"period {year}-{month:02d} is already finalized")


class NotFinalized(DomainError):
    """Reopen attempted on a period that was never finalized. -> HTTP 404."""


class MonthCloseService:
    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._locks = FinalizedMonthRepository(session, project_id=project_id)
        self._snapshots = SnapshotRepository(session, project_id=project_id)
        self._abstract = AbstractService(session)
        self._audit = AuditService(session)

    async def finalize(self, year: int, month: int) -> FinalizeResponse:
        """One transaction: compute the full Abstract -> insert the immutable
        snapshot -> insert the lock row pointing at it -> audit (plan §5.5).
        The finalized_month UNIQUE(project_id, year, month) constraint is
        what actually prevents a second finalize -- caught here as a clean
        409, not a raw IntegrityError.
        """
        existing = await self._locks.get_for_period(self._project_id, year, month)
        if existing is not None and existing.status == "locked":
            raise AlreadyFinalized(year, month)

        abstract = await self._abstract.compute(self._project_id, year, month)
        sections_json = abstract.model_dump(mode="json")
        source_txn_hash = hashlib.sha256(str(sections_json).encode("utf-8")).hexdigest()

        snapshot = MonthlyAbstractSnapshot(
            project_id=self._project_id,
            year=year,
            month=month,
            sections=sections_json,
            source_txn_hash=source_txn_hash,
            pipeline_version=abstract.pipeline_version,
            status="finalized",
            finalized_by=self._user_id,
        )
        await self._snapshots.add(snapshot)

        try:
            if existing is not None:
                # Reopened-then-re-finalized: new snapshot, same lock row, repointed.
                existing.status = "locked"
                existing.current_snapshot_id = snapshot.id
                existing.locked_by = self._user_id
                existing.locked_at = datetime.now(timezone.utc)
                lock = existing
            else:
                lock = FinalizedMonth(
                    project_id=self._project_id,
                    year=year,
                    month=month,
                    status="locked",
                    current_snapshot_id=snapshot.id,
                    locked_by=self._user_id,
                )
                self._session.add(lock)
            await self._session.flush()
        except IntegrityError as exc:
            await self._session.rollback()
            raise AlreadyFinalized(year, month) from exc

        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="monthly_abstract_snapshot",
            row_id=snapshot.id,
            action="FINALIZE",
            after_json={"year": year, "month": month, "snapshot_id": str(snapshot.id)},
        )
        await self._session.commit()

        return FinalizeResponse(
            finalized_month_id=lock.id,
            snapshot_id=snapshot.id,
            status=lock.status,
            year=year,
            month=month,
            finalized_at=lock.locked_at,
        )

    async def reopen(self, year: int, month: int, reason: str) -> None:
        """PRD story 20: requires a non-empty reason (schema-enforced), flips
        the lock to 'reopened', audits -- never deletes the snapshot
        (plan §5.5's 'never deletes the original snapshot')."""
        lock = await self._locks.get_for_period(self._project_id, year, month)
        if lock is None or lock.status != "locked":
            raise NotFinalized(f"period {year}-{month:02d} is not currently finalized")

        lock.status = "reopened"
        lock.reason = reason
        await self._session.flush()

        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="finalized_month",
            row_id=lock.id,
            action="REOPEN",
            after_json={"year": year, "month": month, "reason": reason},
        )
        await self._session.commit()
