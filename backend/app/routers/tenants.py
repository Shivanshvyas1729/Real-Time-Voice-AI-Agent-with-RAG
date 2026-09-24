from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, HTTPException, status
from loguru import logger
import re

from app.database import get_database
from app.models.tenant import Tenant
from app.config import settings

router = APIRouter()


@router.get("/", response_model=List[Tenant], status_code=status.HTTP_200_OK)
async def get_tenants():
    """
    Retrieves all registered tenants. If none exist, seeds the default tenant.
    """
    db = get_database()
    tenants = await db.tenants.find({}).to_list(length=None)

    # Seed default tenant if collection is empty
    if not tenants:
        default_tenant = {
            "tenant_id": settings.TENANT_ID,
            "name": "Default Facility",
            "description": "Primary Default Tenant",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        res = await db.tenants.insert_one(default_tenant)
        default_tenant["_id"] = res.inserted_id
        tenants = [default_tenant]

    return [Tenant(**item) for item in tenants]


@router.post("/", response_model=Tenant, status_code=status.HTTP_201_CREATED)
async def create_tenant(tenant: Tenant):
    """
    Creates a new tenant record in MongoDB.
    """
    db = get_database()

    # Validate slug format
    clean_tenant_id = tenant.tenant_id.strip()
    if not re.match(r"^[a-zA-Z0-9_-]+$", clean_tenant_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant ID must contain only alphanumeric characters, underscores, or hyphens (no spaces)",
        )

    # Check for existing tenant
    existing = await db.tenants.find_one({
        "tenant_id": {"$regex": f"^{re.escape(clean_tenant_id)}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tenant '{clean_tenant_id}' already exists",
        )

    now = datetime.now(timezone.utc)
    tenant_dict = tenant.model_dump(exclude={"id"}, exclude_none=True, by_alias=True)
    tenant_dict["tenant_id"] = clean_tenant_id
    tenant_dict["created_at"] = now
    tenant_dict["updated_at"] = now

    result = await db.tenants.insert_one(tenant_dict)
    tenant_dict["_id"] = result.inserted_id
    logger.info(f"Created new tenant: {clean_tenant_id} ({tenant.name})")
    return Tenant(**tenant_dict)