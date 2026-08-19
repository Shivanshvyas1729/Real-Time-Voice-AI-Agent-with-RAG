from typing import Optional 
from pydantic import BaseModel, Field 



# Step 1: What does the AI read?       ➡️ Create ChunkContent (text + file_name)
# Step 2: What does the Database track? ➡️ Create ChunkMetadata (IDs + scores)
# Step 3: Put them in an envelope!      ➡️ Create RetrievalResult (data + metadata)


class ChunkContent(BaseModel):
    """Clean chunk content for LLM consumption - no IDs or metadata."""

    text: str = Field(..., description="The actual text content of the chunk")
    file_name: Optional[str] = Field(None, description="Source file name for context")
    score: Optional[float] = Field(None, description="Relevance score (0-1)")


class ChunkMetadata(BaseModel):
    """Detailed metadata for a single retrieved vector chunk."""

    chunk_id: str = Field(..., description="Unique chunk identifier")
    document_id: str = Field(..., description="Parent document identifier")
    equipment_id: str = Field(..., description="Equipment identifier")
    tenant_id: Optional[str] = Field(None, description="Tenant identifier")
    chunk_index: int = Field(..., description="Index of chunk within document")
    score: float = Field(..., description="Similarity/relevance score from vector search")
    file_name: str = Field(..., description="Source file name")


class RetrievalMetadata(BaseModel):
    """Metadata detailing the vector search query execution and returned chunks."""

    query: str = Field(..., description="The search query used")
    k: int = Field(..., description="Number of chunks requested")
    chunks_retrieved: int = Field(..., description="Actual number of chunks retrieved")
    equipment_id: Optional[str] = Field(None, description="Equipment filter applied")
    tenant_id: Optional[str] = Field(None, description="Tenant filter applied")
    chunks: list[ChunkMetadata] = Field(default_factory=list, description="Metadata for each retrieved chunk")


class RetrievalResult(BaseModel):
    """Container for RAG retrieval response containing data payload and execution metadata."""

    data: list[ChunkContent] = Field(..., description="Clean chunk content for LLM consumption")
    metadata: RetrievalMetadata = Field(..., description="Metadata about the retrieval operation")