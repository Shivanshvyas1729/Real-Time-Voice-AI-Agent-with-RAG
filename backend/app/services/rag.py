"""
Retrieval-Augmented Generation (RAG) Service Module

Performs vector similarity search against MongoDB Atlas Vector Search index.
Applies equipment_id, tenant_id, and soft-delete filters to retrieve top-k document chunks for LLM generation.
"""

from typing import Any, Optional
from bson import ObjectId
from loguru import logger

from app.config import settings
from app.database import get_database
from app.models.rag import ChunkContent, ChunkMetadata, RetrievalMetadata, RetrievalResult
from app.services.embeddings import EmbeddingService


class RAGService:
    """
    Service providing Retrieval-Augmented Generation (RAG) vector search capabilities.

    Input:
        `index_name` (str): Target MongoDB Atlas Vector Search index (default: "vector_index").
        `embedding_service` (EmbeddingService): Service instance for generating query vector embeddings.

    Output:
        `RetrievalResult`: Domain model containing retrieved text chunks and search metadata.
    """

    def __init__(self, index_name: Optional[str] = None, embedding_service: Optional[EmbeddingService] = None):
        """
        Initializes RAGService with vector index name and embedding service dependency.

        Input:
            index_name (Optional[str]): Atlas Vector Search index name.
            embedding_service (Optional[EmbeddingService]): Embedding service instance.

        Output:
            Configured `self.index_name` and `self.embedding_service`.
        """
        self.index_name = index_name or settings.VECTOR_INDEX_NAME
        self.embedding_service = embedding_service or EmbeddingService()
        logger.debug("RAGService initialized", index_name=self.index_name)

    def _build_filters(
        self,
        equipment_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        extra_filters: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """
        Constructs MongoDB filter criteria for $vectorSearch query.

        Input:
            equipment_id (Optional[str]): Hex string ObjectId of the machine filter.
            tenant_id (Optional[str]): Multi-tenant isolation string filter.
            extra_filters (Optional[dict[str, Any]]): Additional key-value filter conditions.

        Output:
            dict[str, Any]: Filter dictionary (e.g. {"is_disabled": {"$ne": True}, "equipment_id": ObjectId(...)})
        """
        filters: dict[str, Any] = {"is_disabled": {"$ne": True}}

        if equipment_id:
            try:
                filters["equipment_id"] = ObjectId(equipment_id)
                logger.debug(f"Added equipment_id filter: {equipment_id}")
            except Exception as e:
                logger.warning(f"Invalid equipment_id '{equipment_id}'; skipping filter. Error: {e}")

        if tenant_id:
            filters["tenant_id"] = tenant_id
            logger.debug(f"Added tenant_id filter: {tenant_id}")

        if extra_filters:
            filters.update(extra_filters)
            logger.debug(f"Added extra filters: {extra_filters}")

        return filters

    def _build_pipeline(self, query_embedding: list[float], k: int, filters: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Builds MongoDB aggregation pipeline containing $vectorSearch and $project stages.

        Input:
            query_embedding (list[float]): 1024-dimensional query embedding vector.
            k (int): Number of top matching document chunks to return.
            filters (dict[str, Any]): Filter query dictionary built by `_build_filters`.

        Output:
            list[dict[str, Any]]: MongoDB aggregation pipeline array.
        """
        vector_query: dict[str, Any] = {
            "$vectorSearch": {
                "index": self.index_name,
                "path": "embedding",
                "queryVector": query_embedding,
                "numCandidates": k * 10,
                "limit": k,
            }
        }

        if filters:
            vector_query["$vectorSearch"]["filter"] = filters

        return [
            vector_query,
            {
                "$project": {
                    "_id": 1,
                    "chunk_id": 1,
                    "document_id": 1,
                    "file_name": 1,
                    "text": 1,
                    "chunk_index": 1,
                    "equipment_id": 1,
                    "tenant_id": 1,
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
        ]

    async def retrieve(
        self,
        query: str,
        k: int = 5,
        equipment_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        extra_filters: Optional[dict[str, Any]] = None,
    ) -> RetrievalResult:
        """
        Performs end-to-end vector similarity retrieval for a user text query.

        Input:
            query (str): Natural language search query (e.g. "How to fix generator oil leak").
            k (int): Max number of chunks to return (default: 5).
            equipment_id (Optional[str]): Machine equipment ObjectId string filter.
            tenant_id (Optional[str]): Tenant string filter.
            extra_filters (Optional[dict[str, Any]]): Additional metadata filters.

        Output:
            RetrievalResult: Pydantic model containing:
                - `data`: List[ChunkContent] (text, file_name, similarity score)
                - `metadata`: RetrievalMetadata (query, k, chunks count, chunks metadata list)

        Raises:
            ConnectionError: If MongoDB connection or collection handle is uninitialized.
        """
        db = get_database()
        if db is None:
            raise ConnectionError("MongoDB database connection is not initialized.")

        collection = db[settings.DOCUMENT_CHUNKS_COLLECTION]
        if collection is None:
            raise ConnectionError("MongoDB collection is not initialized.")

        try:
            logger.info(f"Starting retrieval for query: '{query[:50]}...' (k={k})")

            # 1. Generate query embedding vector
            logger.debug("Generating query embedding...")
            query_embedding = self.embedding_service.embed_text(query)
            logger.debug("Query embedding generated successfully")

            # 2. Build filters & search pipeline
            filters = self._build_filters(equipment_id=equipment_id, tenant_id=tenant_id, extra_filters=extra_filters)
            pipeline = self._build_pipeline(query_embedding=query_embedding, k=k, filters=filters)

            # 3. Execute vector search aggregation (PyMongo Async API requires await on aggregate())
            logger.debug(f"Executing vector search with index: {self.index_name}")
            cursor = await collection.aggregate(pipeline)
            results = await cursor.to_list(length=k)
            logger.info(f"Retrieved {len(results)} results from vector search")

            # 4. Map MongoDB documents to domain models
            chunk_data: list[ChunkContent] = []
            chunk_metadata: list[ChunkMetadata] = []

            for res in results:
                chunk_data.append(
                    ChunkContent(
                        text=res.get("text", ""),
                        file_name=res.get("file_name"),
                        score=res.get("score"),
                    )
                )

                chunk_metadata.append(
                    ChunkMetadata(
                        chunk_id=res.get("chunk_id", ""),
                        document_id=str(res.get("document_id", "")),
                        equipment_id=str(res.get("equipment_id", "")),
                        tenant_id=res.get("tenant_id"),
                        chunk_index=res.get("chunk_index", 0),
                        score=res.get("score", 0.0),
                        file_name=res.get("file_name", ""),
                    )
                )

            logger.success(f"Successfully processed {len(chunk_data)} chunks")

            return RetrievalResult(
                data=chunk_data,
                metadata=RetrievalMetadata(
                    query=query,
                    k=k,
                    chunks_retrieved=len(chunk_data),
                    equipment_id=equipment_id,
                    tenant_id=tenant_id,
                    chunks=chunk_metadata,
                ),
            )

        except Exception as e:
            logger.error(f"Error during retrieval operation: {e}")
            raise


# Alias for compatibility
RagService = RAGService
