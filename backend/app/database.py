"""
MongoDB Database Connection Management Module

Manages asynchronous MongoDB connection lifecycle using PyMongo AsyncMongoClient.
Provides global access to the active database instance across backend services and routers.
"""

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from app.config import settings
from loguru import logger


client: AsyncMongoClient | None = None
database: AsyncDatabase | None = None


async def connect_to_mongo() -> None:
    """
    Establishes asynchronous connection pool to MongoDB server/Atlas cluster.

    Input:
        Uses `settings.MONGO_URI` or `settings.MONGO_URL` from application settings.

    Output:
        Initializes global `client` (AsyncMongoClient) and `database` (AsyncDatabase).

    Raises:
        Exception: If connection test (`ping` command) fails.
    """
    global client, database
    mongo_uri = settings.MONGO_URI or settings.MONGO_URL
    try:
        # PyMongo Async API connection configuration
        client = AsyncMongoClient(
            mongo_uri,
            serverSelectionTimeoutMS=30000,
            connectTimeoutMS=30000,
            maxIdleTimeMS=45000,
        )
        database = client[settings.DB_NAME]
        # Test connection ping
        await client.admin.command('ping')
        logger.info(f"✅ Connected to MongoDB: {settings.DB_NAME}")
    except Exception as e:
        logger.error(f"❌ Failed to connect to MongoDB: {str(e)}")
        raise


async def close_mongo_connection() -> None:
    """
    Closes the active MongoDB client connection pool cleanly during app shutdown.

    Input:
        Reads global `client` reference.

    Output:
        Closes socket connections and logs shutdown event.
    """
    global client
    if client:
        await client.close()
        logger.info("✅ MongoDB connection closed")


def get_database() -> AsyncDatabase:
    """
    Returns the active MongoDB AsyncDatabase handle.

    Input:
        None.

    Output:
        AsyncDatabase: The active MongoDB database instance handle (e.g. 'live_db').
    """
    return database
