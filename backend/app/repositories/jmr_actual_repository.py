from app.models.transactions import JmrActual
from app.repositories.base import BaseRepository


class JmrActualRepository(BaseRepository[JmrActual]):
    model = JmrActual
