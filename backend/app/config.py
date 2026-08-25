"""
Application Configuration Module

Loads environment variables from environment or local .env file using Pydantic BaseSettings.
Provides strongly typed global settings for database connections, AI model identifiers, and API keys.
"""

from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator


class Settings(BaseSettings):
    """
    Central Application Settings object.

    Input / Sources:
        Reads values from OS Environment Variables or local `.env` file.

    Attributes:
        MONGO_URI (Optional[str]): Primary MongoDB connection URI string.
        MONGO_URL (Optional[str]): Secondary alias for MongoDB connection URI.
        DB_NAME (str): Target MongoDB database name (default: "live_db").

        DEEPGRAM_API_KEY (str): API key for Deepgram Speech-To-Text (STT).
        GROQ_API_KEY (str): API key for Groq LLM services.
        ELEVENLABS_API_KEY (str): API key for ElevenLabs Text-To-Speech (TTS).
        ELEVENLABS_VOICE_ID (str): Voice ID for ElevenLabs audio output.

        GROQ_MODEL (str): Model ID for Groq LLM (default: "openai/gpt-oss-20b").
        GROQ_BASE_URL (str): Groq API endpoint base URL.

        GOOGLE_API_KEY (str): Google Gemini API key.
        AICREDITS_API_KEY (str): AICredits embedding service API key.
        AICREDITS_BASE_URL (str): Base URL for AICredits API.
        EMBEDDING_MODEL (str): Text embedding model ID (default: "baai/bge-m3").
        CHUNK_SIZE (int): Text chunk character limit (default: 1000).
        CHUNK_OVERLAP (int): Character overlap between chunks (default: 250).
        VECTOR_INDEX_NAME (str): MongoDB Atlas Vector Search index name.
        DOCUMENT_CHUNKS_COLLECTION (str): MongoDB collection name for chunks.
        TENANT_ID (str): Multi-tenant isolation identifier.
        USER_ID (str): Default user ID for uploaded documents.
    """

    # MongoDB Settings
    MONGO_URI: Optional[str] = None
    MONGO_URL: Optional[str] = None
    DB_NAME: str = "live_db"

    # Audio & Voice Services
    DEEPGRAM_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = "pNInz6obpgDQGcFmaJgB"

    # LLM Settings
    GROQ_MODEL: str = "openai/gpt-oss-20b"
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"

    # Embedding & RAG Settings
    GOOGLE_API_KEY: str = ""
    AICREDITS_API_KEY: str = ""
    AICREDITS_BASE_URL: str = "https://aicredits.in/v1"
    EMBEDDING_MODEL: str = "baai/bge-m3"
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 250
    VECTOR_INDEX_NAME: str = "vector_index"
    DOCUMENT_CHUNKS_COLLECTION: str = "document_chunks"
    TENANT_ID: str = "mvp_tenant"

    # Hard Coded
    USER_ID: str = "mvp_user"

    @model_validator(mode="after")
    def resolve_mongo_uri(self):
        """
        Input: Self instance after initial property assignment.
        Output: Self instance with MONGO_URI and MONGO_URL synchronized.
        """
        if not self.MONGO_URI and self.MONGO_URL:
            self.MONGO_URI = self.MONGO_URL
        elif not self.MONGO_URL and self.MONGO_URI:
            self.MONGO_URL = self.MONGO_URI
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
