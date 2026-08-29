"""
Stream & WebSocket Connection Router Module

Provides endpoints for:
- REST connection handshake (`POST /api/v1/stream/connect`) to resolve dynamic WebSocket URL.
- Real-time WebSocket streaming session endpoint (`WS /api/v1/stream/ws/{equipment_id}`).
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, status, Request
from pydantic import BaseModel, Field
from typing import Optional
from loguru import logger
from bson import ObjectId
from bson.errors import InvalidId

from app.database import get_database
from app.config import settings
from app.bot import bot

router = APIRouter()


class ConnectRequest(BaseModel):
    """
    Request model for initiating a stream session.

    Input:
        equipment_id (str): Equipment ObjectId string to bind session context.
    """
    equipment_id: str = Field(..., description="Equipment ID to bind session context")


class ConnectResponse(BaseModel):
    """
    Response model containing WebSocket connection details.

    Output:
        ws_url (str): Dynamically constructed WebSocket URL (ws:// or wss://).
    """
    ws_url: str = Field(..., description="Full WebSocket URL for connection")


def parse_object_id(id_str: str) -> ObjectId:
    """
    Safely parses hexadecimal string to MongoDB ObjectId.

    Input:
        id_str (str): 24-char ObjectId string.

    Output:
        ObjectId: BSON ObjectId.

    Raises:
        HTTPException(400): If invalid ObjectId format.
    """
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid ObjectId format: '{id_str}'"
        )


@router.post(
    "/connect",
    response_model=ConnectResponse,
    status_code=status.HTTP_200_OK,
    summary="Initiate Stream Session",
    description="Validates equipment ID and returns a dynamic WebSocket URL for real-time voice streaming."
)
async def connect(request: Request, payload: ConnectRequest):
    """
    Validates equipment and constructs dynamic WebSocket connection URL.

    Input:
        request (Request): FastAPI Request handle for reading headers (X-Forwarded-Proto, X-Forwarded-Host).
        payload (ConnectRequest): JSON payload containing target `equipment_id`.

    Output:
        ConnectResponse: JSON object containing `ws_url` string.

    Raises:
        HTTPException(404): If equipment is not found in database.
    """
    db = get_database()
    equipment_obj_id = parse_object_id(payload.equipment_id)

    equipment = await db.equipment.find_one({"_id": equipment_obj_id})
    if not equipment:
        logger.warning(f"Connect failed: Equipment '{payload.equipment_id}' not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment with ID '{payload.equipment_id}' not found"
        )

    # Scheme & Host resolution for ALB / Reverse Proxy compatibility
    forwarded_proto = request.headers.get("X-Forwarded-Proto", request.url.scheme)
    raw_host = request.headers.get("X-Forwarded-Host") or request.headers.get("host") or request.url.netloc
    forwarded_host = raw_host.split(",")[0].strip() if raw_host else request.url.netloc

    ws_scheme = "wss" if forwarded_proto == "https" else "ws"
    ws_url = f"{ws_scheme}://{forwarded_host}/api/v1/stream/ws/{payload.equipment_id}"

    logger.info(f"Generated WebSocket URL: {ws_url}")

    return ConnectResponse(ws_url=ws_url)


@router.websocket("/ws/{equipment_id}")
async def stream_websocket(websocket: WebSocket, equipment_id: str):
    """
    Real-time WebSocket streaming endpoint for Pipecat voice agent.

    Input:
        websocket (WebSocket): Inbound FastAPI WebSocket connection handle.
        equipment_id (str): Equipment ObjectId path parameter.

    Output:
        Establishes bidirectional audio/text framing pipe managed by `bot(websocket, session_data)`.
    """
    logger.info(f"WebSocket connection requested for equipment_id: {equipment_id}")

    # Accept the WebSocket connection before any processing
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for equipment: {equipment_id}")

    db = get_database()

    # Validate equipment_id format
    if not ObjectId.is_valid(equipment_id):
        logger.error(f"Invalid equipment_id format: {equipment_id}")
        await websocket.close(code=1008, reason="Invalid equipment_id format")
        return

    equipment = await db.equipment.find_one({"_id": ObjectId(equipment_id)})

    if not equipment:
        logger.error(f"Equipment {equipment_id} not found")
        await websocket.close(code=1008, reason="Equipment not found")
        return

    session_data = {
        "equipment_id": equipment_id,
        "tenant_id": equipment.get("tenant_id", settings.TENANT_ID),
        "user_id": settings.USER_ID,
    }

    try:
        await bot(websocket, session_data)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for equipment_id: {equipment_id}")
    except Exception as e:
        logger.error(f"WebSocket error for equipment_id {equipment_id}: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception:
            pass
