from datetime import date, datetime
from typing import Any, List, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field, PrivateAttr

from src.util.schema import make_optional

ConditionType = Union["LogicalCondition", "FieldOperatorCondition"]


# Base structure for a logical group
class LogicalCondition(BaseModel):
    operator: Literal["AND", "OR"]
    conditions: List["ConditionType"]


class FilterSchema(BaseModel):
    operator: Literal["AND", "OR"]
    conditions: List[ConditionType]


class ModelBaseInfo(BaseModel):
    id: int
    uuid: UUID
    created_at: datetime
    updated_at: datetime


class DraftModelBaseInfo(ModelBaseInfo):
    is_draft: bool = True


# Primitive field condition
class FieldOperatorCondition(BaseModel):
    field: str
    operator: Literal[
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "in",
        "not_in",
        "like",
        "ilike",
        "between",
        "is_null",
        "is_not_null",
    ]
    value: Any


# Sort schema
class SortOrder(BaseModel):
    field: str
    direction: Literal["asc", "desc"]


# Base schema for find operations
class FindBase(BaseModel):
    ordering: Optional[str] = None
    sort_orders: Optional[List[SortOrder]] = None
    page: Optional[int] = 1
    page_size: Optional[int] = 10
    search: Optional[str] = None
    filters: Optional[FilterSchema] = None
    searchable_fields: Optional[List[str]] = None


# Schema for displaying search operations
class SearchOptions(FindBase):
    total_count: Optional[int] = None
    total_pages: Optional[int] = None


# Schema for displaying find operation's result
class FindResult(BaseModel):
    founds: Optional[List] = None
    search_options: Optional[SearchOptions] = None


class DateRangeBase(BaseModel):
    from_date: date = Field(
        date.today().replace(day=1),
        description="Start date",
    )
    to_date: date = Field(
        date.today(),
        description="End date",
    )
    _date_column: Optional[str] = PrivateAttr(default="created_at")


class SearchOptions(FindBase):
    total_count: Optional[int]


class FindDateRange(BaseModel):
    created_at__lt: str
    created_at__lte: str
    created_at__gt: str
    created_at__gte: str


class Blank(BaseModel):
    pass


class FindUniqueValues(make_optional(FindBase)):
    field_name: str


class UniqueValuesResult(BaseModel):
    founds: List[Any]
    search_options: Optional[SearchOptions]
