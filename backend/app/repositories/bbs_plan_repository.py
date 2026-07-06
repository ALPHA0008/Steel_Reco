from app.models.transactions import BbsPlan
from app.repositories.base import BaseRepository


class BbsPlanRepository(BaseRepository[BbsPlan]):
    model = BbsPlan
