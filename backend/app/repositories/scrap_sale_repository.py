from app.models.transactions import ScrapSale
from app.repositories.base import BaseRepository


class ScrapSaleRepository(BaseRepository[ScrapSale]):
    model = ScrapSale
