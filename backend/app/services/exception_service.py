import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import NotFoundError
from app.models.system import ExceptionLog
from app.repositories.exception_repository import ExceptionRepository


class ExceptionService:
    """Resolve flow for rules-engine output (plan §6): approve-as-is / corrected
    / follow-up, each requiring a reason -- mirrors month-close's reopen
    (a non-empty reason is enforced at the schema layer, Field(min_length=1)).
    """

    def __init__(self, session: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        self._session = session
        self._project_id = project_id
        self._user_id = user_id
        self._repo = ExceptionRepository(session, project_id=project_id)

    async def list(self, status_filter: str | None = None) -> list[ExceptionLog]:
        return await self._repo.list_by_status(status_filter)

    async def resolve(self, exception_id: uuid.UUID, resolution_type: str, reason: str) -> ExceptionLog:
        row = await self._repo.get(exception_id)
        if row is None:
            raise NotFoundError(f"exception_log {exception_id} not found")

        row.status = "resolved"
        row.resolution_type = resolution_type
        row.resolver_reason = reason
        row.resolved_by = self._user_id
        row.resolved_at = datetime.now(timezone.utc)
        await self._session.commit()
        # Deliberately no session.refresh() here: set_rls_context() uses
        # set_config(..., is_local=true) (transaction-scoped), so commit()
        # above clears the RLS GUCs the same way COMMIT always would --
        # refresh()'s implicit re-SELECT then runs with no RLS context,
        # can_access_project() fails closed, and refresh() throws
        # "Could not refresh instance" even though the UPDATE committed fine.
        # Every field on `row` is already correct in memory (no server-side
        # defaults/triggers touch this row), so there's nothing to reload.
        return row
