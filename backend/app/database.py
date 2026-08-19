from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from app.config import settings
from loguru import logger

client: AsyncMongoClient | None = None
database: AsyncDatabase | None = None


async def connect_to_mongo():
    global client, database
    logger.info("Connecting to MongoDB", uri_prefix=settings.MONGO_URI[:30] + "...")
    try:
        client = AsyncMongoClient(settings.MONGO_URI)
        database = client[settings.DB_NAME]
        await client.admin.command("ping")
        logger.info("Connected to MongoDB", db=settings.DB_NAME)
    except Exception as e:
        logger.error("Failed to connect to MongoDB", error=str(e))
        raise


async def close_mongo_connection():
    global client
    logger.info("Closing MongoDB connection")
    if client:
        await client.close()
        logger.info("MongoDB connection closed")
    else:
        logger.warning("close_mongo_connection called but no active client")


def get_database() -> AsyncDatabase:
    if database is None:
        logger.warning("get_database called before connect_to_mongo")
    return database
