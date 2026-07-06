from app.models.transactions import InterSiteTransfer
from app.repositories.base import BaseRepository


class InterSiteTransferRepository(BaseRepository[InterSiteTransfer]):
    model = InterSiteTransfer
