from app.models.transactions import StoreIssue
from app.repositories.base import BaseRepository


class StoreIssueRepository(BaseRepository[StoreIssue]):
    model = StoreIssue
