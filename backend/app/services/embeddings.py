"""
Embedding Service Module

Provides text splitting (chunking) using LangChain's RecursiveCharacterTextSplitter
and vector embedding generation (single & batch) via OpenAI client (AICredits provider).
"""

from typing import List
from loguru import logger
from openai import OpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.config import settings


class EmbeddingService:
    """
    High-performance Text Splitting and Vector Embedding Service.

    Input:
        Uses `settings.EMBEDDING_MODEL` ("baai/bge-m3"), `settings.AICREDITS_API_KEY`,
        and `settings.AICREDITS_BASE_URL`.

    Output:
        Generates text chunks and 1024-dimensional float vector embeddings for RAG retrieval.
    """

    def __init__(self):
        """
        Initializes OpenAI client and LangChain RecursiveCharacterTextSplitter.

        Input:
            Reads chunk size (default 1000) and overlap (default 250) from application settings.

        Output:
            Configured `self.client`, `self.model`, and `self.text_splitter`.
        """
        logger.info(
            "Initializing EmbeddingService",
            model=settings.EMBEDDING_MODEL,
            base_url=settings.AICREDITS_BASE_URL,
        )
        self.client = OpenAI(
            api_key=settings.AICREDITS_API_KEY,
            base_url=settings.AICREDITS_BASE_URL,
        )
        self.model = settings.EMBEDDING_MODEL

        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            length_function=len,
            is_separator_regex=False,
        )
        logger.info(
            "EmbeddingService ready",
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            model=self.model,
        )

    def split_text(self, text: str) -> List[str]:
        """
        Splits long document text into overlapping text chunks.

        Input:
            text (str): Raw extracted document text string.

        Output:
            List[str]: Array of non-empty text chunk strings.
        """
        logger.debug("Splitting text into chunks", text_length=len(text))
        if not text or not text.strip():
            logger.warning("split_text received empty text, returning empty list")
            return []
        chunks = self.text_splitter.split_text(text)
        logger.info("Text split completed", chunk_count=len(chunks))
        return chunks

    def embed_text(self, text: str) -> List[float]:
        """
        Generates a 1024-dimensional vector embedding for a single text query or chunk.

        Input:
            text (str): Single string prompt or chunk (e.g. "generator maintenance procedure").

        Output:
            List[float]: 1024-dimensional floating-point vector (e.g. [-0.018, 0.042, ...]).

        Raises:
            ValueError: If input text is empty or whitespace.
        """
        logger.debug("Embedding single chunk", text_length=len(text))
        if not text or not text.strip():
            raise ValueError("Cannot embed empty text")
        
        response = self.client.embeddings.create(
            model=self.model,
            input=text,
        )
        embedding = response.data[0].embedding
        logger.debug("Chunk embedded successfully", embedding_dim=len(embedding))
        return embedding

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Generates 1024-dimensional vector embeddings for a batch of text chunks in a single API call.

        Input:
            texts (List[str]): List of chunk strings (e.g. ["chunk 0", "chunk 1", "chunk 2"]).

        Output:
            List[List[float]]: Matrix of float vectors aligned to the exact input index order.
            
        Technical Note:
            Server worker threads process batch items in parallel and may return `response.data`
            out-of-order. Sorting by `x.index` guarantees index 0 matches text 0, index 1 matches text 1.
        """
        logger.info("Embedding batch of texts", total=len(texts))
        if not texts:
            logger.warning("embed_texts received empty list")
            return []
        
        valid_texts = [t for t in texts if t and t.strip()]
        skipped = len(texts) - len(valid_texts)
        if skipped:
            logger.warning("Skipped empty texts in batch", skipped=skipped)
        if not valid_texts:
            logger.warning("No valid texts to embed after filtering")
            return []

        response = self.client.embeddings.create(
            model=self.model,
            input=valid_texts,
        )
        # Sort embeddings by index to preserve input order alignment [0, 1, 2]
        sorted_data = sorted(response.data, key=lambda x: x.index)
        embeddings = [item.embedding for item in sorted_data]
        logger.info("Batch embedding complete", embedded=len(embeddings))
        return embeddings
