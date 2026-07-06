from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PageMeta(BaseModel):
    total: int
    skip: int
    limit: int


class PagedResponse(BaseModel, Generic[T]):
    items: list[T]
    meta: PageMeta
