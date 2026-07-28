from datetime import date

from app.models.system import ExceptionLog
from app.repositories.base import BaseRepository


class ExceptionRepository(BaseRepository[ExceptionLog]):
    model = ExceptionLog

    async def list_by_status(self, status_filter: str | None = None) -> list[ExceptionLog]:
        """Newest first; optionally filtered to one status
        (open/pending/resolved/dismissed). "open" also returns pending
        follow-ups, since both are unanswered and both block a month close --
        hiding a pending commitment from the open queue would let it be
        forgotten, which is what the follow-up flow exists to prevent."""
        stmt = self._scoped_select()
        if status_filter == "open":
            stmt = stmt.where(ExceptionLog.status.in_(["open", "pending"]))
        elif status_filter is not None:
            stmt = stmt.where(ExceptionLog.status == status_filter)
        stmt = stmt.order_by(ExceptionLog.created_at.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def list_overdue_pending(self, today: date) -> list[ExceptionLog]:
        """Pending follow-ups whose promised date has passed -- the sweep that
        puts a missed commitment back in front of whoever made it."""
        stmt = (
            self._scoped_select()
            .where(ExceptionLog.status == "pending")
            .where(ExceptionLog.follow_up_due_date.is_not(None))
            .where(ExceptionLog.follow_up_due_date < today)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_unanswered(self) -> int:
        """Open + pending, i.e. everything still owing a decision. This is the
        month-close gate: an Abstract must not be finalized while any exception
        is unanswered."""
        stmt = self._scoped_select().where(ExceptionLog.status.in_(["open", "pending"]))
        result = await self.session.execute(stmt)
        return len(list(result.scalars().all()))
