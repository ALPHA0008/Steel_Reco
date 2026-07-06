import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system import AuditLog


class AuditRepository:
    """audit_log has no project-scoped BaseRepository pattern -- it's written
    in the SAME transaction as the ledger row it describes (plan §5.1), never
    read/listed through the normal CRUD path in Phase 1.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

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
    ) -> AuditLog:
        entry = AuditLog(
            user_id=user_id,
            project_id=project_id,
            table_name=table_name,
            row_id=row_id,
            action=action,
            before_json=before_json,
            after_json=after_json,
        )
        self.session.add(entry)
        await self.session.flush()
        return entry
