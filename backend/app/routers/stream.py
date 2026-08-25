import uuid
from typing import Any, Dict
from bson import ObjectId
from fastapi import (
    APIRouter,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from loguru import logger
from pydantic import BaseModel, Field

from app.bot import bot
from app.config import settings
from app.database import get_database

router = APIRouter()


class ConnectRequest(BaseModel):
    equipment_id: str = Field(..., description="The unique ID of the equipment")


@router.post("/connect")
async def bot_connect(request: Request, payload: ConnectRequest) -> Dict[str, Any]:
    """
    Validates equipment existence and generates a WebSocket connection URL.
    """
    logger.info(
        f"Received connect request from {request.client.host if request.client else 'unknown'}"
    )

    db = get_database()

    # Validate MongoDB ObjectId format
    if not ObjectId.is_valid(payload.equipment_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid equipment_id format",
        )

    equipment = await db.equipment.find_one({"_id": ObjectId(payload.equipment_id)})

    if not equipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment {payload.equipment_id} not found",
        )

    # Scheme & Host resolution for ALB / Reverse Proxy setups
    forwarded_proto = request.headers.get("X-Forwarded-Proto", request.url.scheme)
    forwarded_host = request.headers.get("X-Forwarded-Host", request.url.netloc)

    ws_scheme = "wss" if forwarded_proto == "https" else "ws"
    ws_url = f"{ws_scheme}://{forwarded_host}/api/v1/stream/ws/{payload.equipment_id}"

    logger.info(f"Generated WebSocket URL: {ws_url}")

    return {"ws_url": ws_url}


@router.websocket("/ws/{equipment_id}")
async def websocket_endpoint(websocket: WebSocket, equipment_id: str):
    """
    WebSocket endpoint that validates equipment context and boots the Pipecat bot runner.
    """
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for equipment: {equipment_id}")

    try:
        db = get_database()

        if not ObjectId.is_valid(equipment_id):
            logger.error(f"Invalid equipment_id format: {equipment_id}")
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Invalid equipment_id format",
            )
            return

        equipment = await db.equipment.find_one({"_id": ObjectId(equipment_id)})

        if not equipment:
            logger.error(f"Equipment {equipment_id} not found")
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Equipment not found",
            )
            return

        session_data = {
            "equipment_id": equipment_id,
            "tenant_id": settings.TENANT_ID,
            "session_id": str(uuid.uuid4()),
            "user_id": settings.USER_ID,
        }

        # Hand off execution to Pipecat bot worker
        await bot(websocket, session_data)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected gracefully")
    except Exception as e:
        logger.error(f"Error in stream handler: {e}", exc_info=True)
        try:
            await websocket.close(
                code=status.WS_1011_INTERNAL_ERROR, reason="Internal server error"
            )
        except Exception:
            pass