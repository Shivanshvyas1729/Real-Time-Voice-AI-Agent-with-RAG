"""
Hybrid RAG Service Module using MongoDB Atlas Vector Search,
Native Full-Text Search, and In-Memory Reciprocal Rank Fusion (RRF).
Includes detailed error tracking, diagnostics, and problem reporting.
"""

import asyncio
from typing import Any, Optional
from bson import ObjectId
from bson.errors import InvalidId
from loguru import logger

from app.config import settings
from app.database import get_database
from app.models.rag import ChunkContent, ChunkMetadata, RetrievalMetadata, RetrievalResult
from app.services.embeddings import EmbeddingService


class RAGService:
    """
    High-performance Hybrid Search service combining MongoDB Atlas Vector Search
    with native MongoDB $text keyword search using Reciprocal Rank Fusion (RRF).
    """

    # Strict security boundary: prevents extra_filters from tampering with tenant/equipment isolation
    PROTECTED_FILTER_KEYS = frozenset({"tenant_id", "equipment_id", "is_disabled"})

    def __init__(
        self,
        index_name: Optional[str] = None,
        embedding_service: Optional[EmbeddingService] = None,
        default_candidate_pool_size: int = 40,
        default_weights: Optional[dict[str, float]] = None,
        rrf_constant: int = 60,
    ):
        self.index_name = index_name or settings.VECTOR_INDEX_NAME
        self.embedding_service = embedding_service or EmbeddingService()
        self.candidate_pool_size = default_candidate_pool_size
        self.rrf_k = rrf_constant

        # Relative ranking weights (70% Vector Semantic, 30% Keyword Precision)
        weights = default_weights or {"vector": 0.70, "keyword": 0.30}
        total = sum(weights.values())
        self.weights = {k: v / total for k, v in weights.items()}
        logger.debug("RAGService initialized with RRF", index_name=self.index_name, weights=self.weights)

    def _build_filters(
        self,
        equipment_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        extra_filters: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """
        Constructs sanitized MongoDB filters using project's 'is_disabled' field.
        Prevents operator injection and enforces tenant/equipment security boundaries.
        """
        filters: dict[str, Any] = {"is_disabled": {"$ne": True}}

        if extra_filters:
            sanitized = {
                k: v for k, v in extra_filters.items()
                if k not in self.PROTECTED_FILTER_KEYS and not str(k).startswith("$")
            }
            filters.update(sanitized)

        if equipment_id:
            try:
                filters["equipment_id"] = ObjectId(equipment_id)
            except (InvalidId, TypeError) as err:
                raise ValueError(f"Invalid equipment_id '{equipment_id}': Must be a valid 24-char ObjectId.") from err

        if tenant_id:
            filters["tenant_id"] = str(tenant_id).strip()

        return filters

    def _build_vector_pipeline(self, query_embedding: list[float], limit: int, filters: dict[str, Any]) -> list[dict[str, Any]]:
        """Atlas Vector Search aggregation pipeline."""
        num_candidates = min(max(50, limit * 3), 10000)
        return [
            {
                "$vectorSearch": {
                    "index": self.index_name,
                    "path": "embedding",
                    "queryVector": query_embedding,
                    "numCandidates": num_candidates,
                    "limit": limit,
                    "filter": filters,
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "chunk_id": 1,
                    "document_id": 1,
                    "equipment_id": 1,
                    "tenant_id": 1,
                    "file_name": 1,
                    "text": 1,
                    "chunk_index": 1,
                    "vector_score": {"$meta": "vectorSearchScore"},
                }
            },
        ]

    def _build_text_pipeline(self, query: str, limit: int, filters: dict[str, Any]) -> list[dict[str, Any]]:
        """Native MongoDB $text search aggregation pipeline."""
        return [
            {"$match": {"$text": {"$search": query}, **filters}},
            {
                "$project": {
                    "_id": 1,
                    "chunk_id": 1,
                    "document_id": 1,
                    "equipment_id": 1,
                    "tenant_id": 1,
                    "file_name": 1,
                    "text": 1,
                    "chunk_index": 1,
                    "text_score": {"$meta": "textScore"},
                }
            },
            {"$sort": {"text_score": {"$meta": "textScore"}}},
            {"$limit": limit},
        ]

    def _apply_reciprocal_rank_fusion(
        self,
        vector_results: list[dict[str, Any]],
        text_results: list[dict[str, Any]],
        k: int,
    ) -> list[dict[str, Any]]:
        """
        Merges results using Reciprocal Rank Fusion (RRF):
        Score(d) = sum( weight / (k_rrf + rank) )
        Normalizes final score to [0.0, 1.0] for clean UI confidence display.
        """
        rrf_map: dict[str, dict[str, Any]] = {}
        w_vec = self.weights["vector"]
        w_txt = self.weights["keyword"]

        # Maximum theoretical score for normalization
        max_theoretical_rrf = (w_vec / (self.rrf_k + 1)) + (w_txt / (self.rrf_k + 1))

        # 1. Score vector search candidates by rank
        for rank, doc in enumerate(vector_results):
            c_id = doc.get("chunk_id") or str(doc.get("_id"))
            score = w_vec * (1.0 / (self.rrf_k + rank + 1))
            doc_copy = dict(doc)
            doc_copy["rrf_score"] = score
            doc_copy["vector_rank"] = rank + 1
            doc_copy["text_rank"] = None
            rrf_map[c_id] = doc_copy

        # 2. Score keyword search candidates by rank and fuse
        for rank, doc in enumerate(text_results):
            c_id = doc.get("chunk_id") or str(doc.get("_id"))
            score = w_txt * (1.0 / (self.rrf_k + rank + 1))
            if c_id in rrf_map:
                rrf_map[c_id]["rrf_score"] += score
                rrf_map[c_id]["text_rank"] = rank + 1
            else:
                doc_copy = dict(doc)
                doc_copy["rrf_score"] = score
                doc_copy["vector_rank"] = None
                doc_copy["text_rank"] = rank + 1
                rrf_map[c_id] = doc_copy

        # 3. Normalize score into [0.0, 1.0]
        for doc in rrf_map.values():
            normalized = doc["rrf_score"] / max_theoretical_rrf
            doc["final_score"] = round(min(1.0, max(0.0, normalized)), 4)

        # Sort descending by normalized score
        ranked = sorted(rrf_map.values(), key=lambda x: x["final_score"], reverse=True)
        return ranked[:k]

    async def retrieve(
        self,
        query: str,
        k: int = 10,
        equipment_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        extra_filters: Optional[dict[str, Any]] = None,
    ) -> RetrievalResult:
        """
        Executes concurrent hybrid retrieval (Atlas Vector + MongoDB $text) fused via RRF.
        Captures diagnostic error telemetry to easily troubleshoot empty or failed queries.
        """
        clean_query = (query or "").strip()
        if not clean_query:
            raise ValueError("Query string cannot be empty.")

        db = get_database()
        if db is None:
            raise ConnectionError("MongoDB database connection is not initialized.")
        collection = db[settings.DOCUMENT_CHUNKS_COLLECTION]

        # 1. Build security filters
        filters = self._build_filters(equipment_id=equipment_id, tenant_id=tenant_id, extra_filters=extra_filters)

        # 2. Non-blocking embedding generation on thread pool (keeps event loop snappy!)
        query_embedding = await asyncio.to_thread(self.embedding_service.embed_text, clean_query)

        # 3. Pipelines for both retrieval modes
        pool_depth = max(self.candidate_pool_size, k * 4)
        vec_pipeline = self._build_vector_pipeline(query_embedding, pool_depth, filters)
        txt_pipeline = self._build_text_pipeline(clean_query, pool_depth, filters)

        # 4. Concurrent execution with diagnostic error capture
        vector_error: Optional[str] = None
        text_error: Optional[str] = None

        async def fetch_vector():
            nonlocal vector_error
            try:
                cursor = await collection.aggregate(vec_pipeline)
                return await cursor.to_list(length=pool_depth)
            except Exception as e:
                vector_error = str(e)
                logger.error(f"Vector search failed: {e}")
                return []

        async def fetch_text():
            nonlocal text_error
            try:
                cursor = await collection.aggregate(txt_pipeline)
                return await cursor.to_list(length=pool_depth)
            except Exception as e:
                text_error = str(e)
                logger.warning(f"Keyword search skipped or failed: {e}")
                return []

        # Run vector search and text search in parallel
        vector_docs, text_docs = await asyncio.gather(fetch_vector(), fetch_text())

        # If BOTH failed with database exceptions, raise informative error
        if vector_error and text_error and not vector_docs and not text_docs:
            raise RuntimeError(
                f"Database Retrieval Error: Both Vector search and Keyword search failed. "
                f"Vector error: {vector_error}; Text error: {text_error}"
            )

        # 5. Reciprocal Rank Fusion
        top_candidates = self._apply_reciprocal_rank_fusion(vector_docs, text_docs, k=k)

        # 6. Build diagnostic problem shower metadata
        diagnostics: dict[str, Any] = {
            "vector_search": {
                "status": "error" if vector_error else "ok",
                "error": vector_error,
                "candidates_found": len(vector_docs),
            },
            "keyword_search": {
                "status": "error" if text_error else "ok",
                "error": text_error,
                "candidates_found": len(text_docs),
            },
            "filters_applied": {
                "equipment_id": str(equipment_id) if equipment_id else None,
                "tenant_id": str(tenant_id) if tenant_id else None,
            },
        }

        if len(top_candidates) == 0:
            diagnostics["problem_shower"] = (
                f"No document chunks matched your query '{clean_query}'. "
                f"Filter applied: equipment_id='{equipment_id}', tenant_id='{tenant_id}'. "
                "Ensure documents are uploaded for this equipment and the tenant_id matches the uploaded equipment tenant."
            )

        # 7. Map to Domain Models
        chunk_data = [
            ChunkContent(
                text=doc.get("text", ""),
                file_name=doc.get("file_name"),
                score=doc.get("final_score", 0.0),
            )
            for doc in top_candidates
        ]

        chunk_metadata = [
            ChunkMetadata(
                chunk_id=str(doc.get("chunk_id", "")),
                document_id=str(doc.get("document_id", "")),
                equipment_id=str(doc.get("equipment_id", "")),
                tenant_id=doc.get("tenant_id"),
                chunk_index=doc.get("chunk_index", 0),
                score=doc.get("final_score", 0.0),
                file_name=doc.get("file_name", ""),
            )
            for doc in top_candidates
        ]

        logger.info(f"Hybrid RRF retrieval returned {len(chunk_data)} chunks for query: '{clean_query[:40]}'")

        return RetrievalResult(
            data=chunk_data,
            metadata=RetrievalMetadata(
                query=clean_query,
                k=k,
                chunks_retrieved=len(chunk_data),
                equipment_id=equipment_id,
                tenant_id=tenant_id,
                chunks=chunk_metadata,
                diagnostics=diagnostics,
            ),
        )


# Backward compatibility alias
RagService = RAGService
