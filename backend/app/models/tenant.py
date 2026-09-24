from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.equipment import PyObjectId


class Tenant(BaseModel):
    """Pydantic model representing a Tenant entity in MongoDB."""

    id: Optional[PyObjectId] = Field(
        default=None,
        alias="_id",
        serialization_alias="_id",
        description="MongoDB document unique ID",
    )
    tenant_id: str = Field(..., description="Unique alphanumeric identifier or slug for the tenant")
    name: str = Field(..., description="Human-readable organization or plant name")
    description: Optional[str] = Field(default="", description="Optional tenant description")
    is_active: bool = Field(default=True, description="Active state of the tenant")

    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC creation timestamp",
    )
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC last updated timestamp",
    )

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )

