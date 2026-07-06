from app.models.system import ExceptionLog
from app.repositories.base import BaseRepository


class ExceptionRepository(BaseRepository[ExceptionLog]):
    model = ExceptionLog

    async def list_by_status(self, status_filter: str | None = None) -> list[ExceptionLog]:
        """Newest first; optionally filtered to one status (open/resolved/dismissed)."""
        stmt = self._scoped_select()
        if status_filter is not None:
            stmt = stmt.where(ExceptionLog.status == status_filter)
        stmt = stmt.order_by(ExceptionLog.created_at.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
