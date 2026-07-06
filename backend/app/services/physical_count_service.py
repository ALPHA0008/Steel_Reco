import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import MonthLocked
from app.models.transactions import PhysicalCount
from app.repositories.month_lock_repository import MonthLockRepository
from app.repositories.physical_count_repository import PhysicalCountRepository
from app.schemas.transactions import PhysicalCountCreate
from app.services.audit_service import AuditService


class PhysicalCountService:
    """Cut-piece classification blocking rule (PRD §6) is enforced by the DB
    CHECK constraints (scrap_rule, NOT NULL) on physical_count_cut_piece
    (plan §3.2) -- an IntegrityError from a bad classification propagates up
    as a raw 500 unless the caller maps it; the Pydantic CutPieceCreate
    validator (plan §5.1 'client-side mirror') catches the common case first
    with a clean 422 before it ever reaches the DB.
    """

    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = PhysicalCountRepository(session, project_id=project_id)
        self._locks = MonthLockRepository(session)
        self._audit = AuditService(session)

    async def create(self, payload: PhysicalCountCreate) -> PhysicalCount:
        if await self._locks.is_finalized(
            self._project_id, payload.effective_date.year, payload.effective_date.month
        ):
            raise MonthLocked(payload.effective_date.year, payload.effective_date.month)

        data = payload.model_dump(exclude={"cut_pieces"})
        count = PhysicalCount(**data, created_by=self._user_id)
        cut_pieces = [cp.model_dump() for cp in payload.cut_pieces]
        await self._repo.add_with_cut_pieces(count, cut_pieces)

        await self._audit.record(
            user_id=self._user_id,
            project_id=self._project_id,
            table_name="physical_count",
            row_id=count.id,
            action="CREATE",
            after_json={
                "contractor_id": str(count.contractor_id),
                "dia_grade_id": str(count.dia_grade_id),
                "bundle_count": count.bundle_count,
                "cut_piece_count": len(cut_pieces),
            },
        )
        await self._session.commit()
        return count
