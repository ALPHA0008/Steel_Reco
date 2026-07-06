import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.audit_repository import AuditRepository


class AuditService:
    """Writes audit_log rows in the SAME transaction as the ledger write it
    describes (plan §5.1) -- the audit and the write commit or roll back
    together. Not a context manager (the caller's transaction already spans
    the whole write path, per store_issue_service's async with pattern in
    plan §5.3) -- this just adds the audit row before the transaction commits.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._repo = AuditRepository(session)

    async def record(
        self,
        *,
        user_id: uuid.UUID,
        project_id: uuid.UUID | None,
        table_name: str,
        row_id: uuid.UUID | None,
        action: str,
        before_json: dict[str, Any] | None = None,
        after_json: dict[str, Any] | None = None,
    ) -> None:
        await self._repo.record(
            user_id=user_id,
            project_id=project_id,
            table_name=table_name,
            row_id=row_id,
            action=action,
            before_json=before_json,
            after_json=after_json,
        )
