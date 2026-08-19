from pydantic_settings import BaseSettings, SettingsConfigDict



class Settings(BaseSettings):

    MONGO_URI: str 
    DB_NAME : str = "live_db"
    EMBEDDING_MODEL: str = "baai/bge-m3"
    API_KEY:str 
    BASE_URL:str
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 250
    VECTOR_INDEX_NAME: str = "vector_index"
    DOCUMENT_CHUNKS_COLLECTION: str = "document_chunks"
    TENANT_ID: str = "mvp_tenant"


    # Hard Coded
    USER_ID: str = "mvp_user"

    model_config = SettingsConfigDict(
        env_file =".env",
        case_sensitive = True,
        extra = "ignore"
    )


settings = Settings()
