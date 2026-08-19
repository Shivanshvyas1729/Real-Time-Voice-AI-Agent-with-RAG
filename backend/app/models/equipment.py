from datetime import datetime, timezone
from typing import Annotated, Optional
from bson import ObjectId
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    WithJsonSchema,
)


# 1. Helper function: converts incoming string or ObjectId to a BSON ObjectId
def validate_object_id(v: str | ObjectId) -> ObjectId:
    if isinstance(v, ObjectId):
        return v
    if isinstance(v, str) and ObjectId.is_valid(v):
        return ObjectId(v)
    raise ValueError(f"Invalid ObjectId: {v}")


# 2. Custom Type for MongoDB ObjectId (Pydantic V2)
PyObjectId = Annotated[
    ObjectId,
    BeforeValidator(validate_object_id),  # INBOUND: string -> BSON ObjectId
    PlainSerializer(
        lambda v: str(v), return_type=str
    ),  # OUTBOUND: BSON ObjectId -> string
    WithJsonSchema({"type": "string", "example": "507f1f77bcf86cd799439011"}),
]


# 3. Equipment Model with Field Metadata and Timestamps
class Equipment(BaseModel):
    """Pydantic model representing an Equipment entity in MongoDB."""

    id: Optional[PyObjectId] = Field(
        default=None,
        alias="_id",
        serialization_alias="_id",
        description="MongoDB document unique ID",
    )

    name: str = Field(..., description="Name of the equipment")
    description: str = Field(..., description="Detailed equipment description")
    tenant_id: str = Field(..., description="Multi-tenancy identifier")

    is_active: bool = Field(default=True, description="Status of the equipment")

    # Timestamps with automatic timezone-aware defaults
    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC creation timestamp",
    )
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC last updated timestamp",
    )

    # Modern Pydantic V2 Config
    model_config = ConfigDict(
        populate_by_name=True,  # Allows creation using either 'id' or '_id'
        arbitrary_types_allowed=True,  # Permits PyMongo BSON/ObjectId types
    )