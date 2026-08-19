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


# 1. Helper function to validate & convert ObjectId input
def validate_object_id(v: str | ObjectId) -> ObjectId:
    if isinstance(v, ObjectId):
        return v
    if isinstance(v, str) and ObjectId.is_valid(v):
        return ObjectId(v)
    raise ValueError(f"Invalid ObjectId: {v}")


# 2. Custom Type for MongoDB ObjectId
PyObjectId = Annotated[
    ObjectId,
    BeforeValidator(validate_object_id),  # INBOUND: string/ObjectId -> ObjectId
    PlainSerializer(
        lambda v: str(v), return_type=str
    ),  # OUTBOUND: ObjectId -> string
    WithJsonSchema({"type": "string", "example": "507f1f77bcf86cd799439011"}),
]


# 3. Complete Document Model
class Document(BaseModel):
    """Pydantic model representing a file/document entity in MongoDB."""

    id: Optional[PyObjectId] = Field(
        default=None,
        alias="_id",
        serialization_alias="_id",
        description="MongoDB document unique ID",
    )

    equipment_id: PyObjectId = Field(
        ..., description="Associated equipment reference ID"
    )
    tenant_id: str = Field(..., description="Multi-tenancy identifier")

    file_name: str = Field(..., description="Original name of the uploaded file")
    content_type: str = Field(
        ..., description="MIME type of the file (e.g. application/pdf)"
    )
    size: int = Field(..., ge=0, description="File size in bytes")
    storage_key: str = Field(
        ..., description="Cloud storage object key or path"
    )
    uploaded_by: str = Field(..., description="User ID or email of the uploader")

    description: Optional[str] = Field(
        default=None, description="Optional description of the document"
    )
    embedding_status: str = Field(
        default="pending",
        description="Vector processing status (e.g., pending, completed, failed)",
    )
    embedding_error: Optional[dict] = Field(
        default=None, description="Error payload if embedding generation fails"
    )

    # Timestamps with automatic timezone-aware defaults
    created_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC creation timestamp",
    )
    
    updated_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC last updated timestamp",
    )

    # Pydantic V2 Configuration
    model_config = ConfigDict(
        populate_by_name=True,  # Allows creation using either 'id' or '_id'
        arbitrary_types_allowed=True,  # Permits PyMongo BSON/ObjectId types
    )