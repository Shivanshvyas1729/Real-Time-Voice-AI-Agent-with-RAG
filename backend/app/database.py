from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from app.config import settings
from loguru import logger


client: AsyncMongoClient | None = None
database: AsyncDatabase | None = None


async def connect_to_mongo():
    """Create database connection"""
    global client, database
    mongo_uri = settings.MONGO_URI or settings.MONGO_URL
    try:
        # PyMongo Async API automatically handles TLS for mongodb+srv:// connections
        client = AsyncMongoClient(
            mongo_uri,
            serverSelectionTimeoutMS=30000,  # 30 seconds timeout
            connectTimeoutMS=30000,
            socketTimeoutMS=30000,
        )
        database = client[settings.DB_NAME]
        # Test connection
        await client.admin.command('ping')
        logger.info(f"✅ Connected to MongoDB: {settings.DB_NAME}")
    except Exception as e:
        logger.error(f"❌ Failed to connect to MongoDB: {str(e)}")
        raise


async def close_mongo_connection():
    """Close database connection"""
    global client
    if client:
        await client.close()
        logger.info("✅ MongoDB connection closed")


def get_database() -> AsyncDatabase:
    """Get database instance"""
    return database
