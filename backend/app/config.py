from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator


class Settings(BaseSettings):
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
    EMBEDDING_MODEL: str = "google/text-embedding-004"
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 250
    VECTOR_INDEX_NAME: str = "vector_index"
    DOCUMENT_CHUNKS_COLLECTION: str = "document_chunks"
    TENANT_ID: str = "mvp_tenant"

    # Hard Coded
    USER_ID: str = "mvp_user"

    @model_validator(mode="after")
    def resolve_mongo_uri(self):
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
