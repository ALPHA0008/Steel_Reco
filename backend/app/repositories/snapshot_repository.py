from app.models.transactions import MonthlyAbstractSnapshot
from app.repositories.base import BaseRepository


class SnapshotRepository(BaseRepository[MonthlyAbstractSnapshot]):
    model = MonthlyAbstractSnapshot
