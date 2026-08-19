from typing import List
from loguru import logger
from openai import OpenAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.config import settings


class EmbeddingService:

    def __init__(self):
        logger.info(
            "Initializing EmbeddingService",
            model=settings.EMBEDDING_MODEL,
            base_url=settings.BASE_URL,
        )
        self.client = OpenAI(
            api_key=settings.API_KEY,
            base_url=settings.BASE_URL,
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
        logger.debug("Splitting text into chunks", text_length=len(text))
        if not text or not text.strip():
            logger.warning("split_text received empty text, returning empty list")
            return []
        chunks = self.text_splitter.split_text(text)
        logger.info("Text split completed", chunk_count=len(chunks))
        return chunks

    def embed_text(self, text: str) -> List[float]:
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
        # Sort embeddings by index to preserve order
        sorted_data = sorted(response.data, key=lambda x: x.index)
        embeddings = [item.embedding for item in sorted_data]
        logger.info("Batch embedding complete", embedded=len(embeddings))
        return embeddings
