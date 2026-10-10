"""
Stream & Real-Time Voice Connection Router Module

Provides dual-transport capabilities:
1. SmallWebRTC (Ultra-low latency, native Opus WebRTC with browser jitter buffer & AEC)
   - POST /offer or /offer/{equipment_id}
   - PATCH /offer or /offer/{equipment_id}
   - POST /start
2. WebSocket (Legacy raw PCM streaming)
   - POST /connect
   - WS /ws/{equipment_id}
"""

import uuid
from typing import Optional, Dict, Any, List
from fastapi import (
    APIRouter,
    WebSocket,
    WebSocketDisconnect,
    HTTPException,
    status,
    Request,
    BackgroundTasks,
)
from pydantic import BaseModel, Field
from loguru import logger
from bson import ObjectId
from bson.errors import InvalidId

from app.database import get_database
from app.config import settings
from app.bot import run_bot, bot

from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCRequest,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequestHandler,
)
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.transports.base_transport import TransportParams
from pipecat.audio.vad.silero import SileroVADAnalyzer, VADParams

router = APIRouter()

# Global SmallWebRTC request handler instance
small_webrtc_handler = SmallWebRTCRequestHandler()


class ConnectRequest(BaseModel):
    """Request model for initiating a stream session."""
    equipment_id: str = Field(..., description="Equipment ID to bind session context")


class ConnectResponse(BaseModel):
    """Response model containing connection details for both WebRTC and WebSocket."""
    ws_url: str = Field(..., description="Full WebSocket URL for connection")
    webrtc_url: Optional[str] = Field(None, description="Full SmallWebRTC offer URL")
    session_id: Optional[str] = Field(None, description="Generated session ID")


def parse_object_id(id_str: str) -> ObjectId:
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
    description="Validates equipment ID and returns connection URLs for WebSocket and SmallWebRTC."
)
async def connect(request: Request, payload: ConnectRequest):
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
    http_scheme = "https" if forwarded_proto == "https" else "http"

    ws_url = f"{ws_scheme}://{forwarded_host}/api/v1/stream/ws/{payload.equipment_id}"
    webrtc_url = f"{http_scheme}://{forwarded_host}/api/v1/stream/offer/{payload.equipment_id}"

    session_id = str(uuid.uuid4())
    logger.info(f"Generated WebSocket URL: {ws_url} | SmallWebRTC URL: {webrtc_url}")

    return ConnectResponse(
        ws_url=ws_url,
        webrtc_url=webrtc_url,
        session_id=session_id,
    )


# =========================================================================
# SmallWebRTC Handlers (Crystal-clear Opus WebRTC audio with native AEC)
# =========================================================================

@router.post("/start")
async def webrtc_start(request: Request):
    """Mimics Pipecat start endpoint returning session configuration and STUN servers."""
    return {
        "sessionId": str(uuid.uuid4()),
        "iceConfig": {
            "iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]
        }
    }


@router.post("/offer")
@router.post("/offer/{equipment_id}")
async def webrtc_offer(
    request: SmallWebRTCRequest,
    background_tasks: BackgroundTasks,
    equipment_id: Optional[str] = None,
):
    """
    Handle WebRTC offer requests via SmallWebRTCRequestHandler.
    Runs run_bot() attached to SmallWebRTCTransport in the background.
    """
    req_data = request.request_data or {}
    target_eq_id = equipment_id or req_data.get("equipment_id")

    db = get_database()
    equipment = None
    if target_eq_id and ObjectId.is_valid(target_eq_id):
        equipment = await db.equipment.find_one({"_id": ObjectId(target_eq_id)})

    session_data = {
        "equipment_id": target_eq_id or "",
        "tenant_id": equipment.get("tenant_id", settings.TENANT_ID) if equipment else settings.TENANT_ID,
        "user_id": settings.USER_ID,
        "equipment_name": equipment.get("name", "") if equipment else "",
        "equipment_description": equipment.get("description", "") if equipment else "",
    }

    async def webrtc_connection_callback(connection: SmallWebRTCConnection):
        logger.info(f"SmallWebRTC peer connection established for equipment: {target_eq_id}")
        transport = SmallWebRTCTransport(
            params=TransportParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
            ),
            webrtc_connection=connection,
        )
        background_tasks.add_task(run_bot, transport, session_data)

    answer = await small_webrtc_handler.handle_web_request(
        request=request,
        webrtc_connection_callback=webrtc_connection_callback,
    )
    return answer


@router.patch("/offer")
@router.patch("/offer/{equipment_id}")
async def webrtc_ice_candidate(
    request: SmallWebRTCPatchRequest,
    equipment_id: Optional[str] = None,
):
    """Handle WebRTC ICE candidate trickling requests."""
    logger.debug(f"Received ICE candidate patch request: {request}")
    await small_webrtc_handler.handle_patch_request(request)
    return {"status": "success"}


# =========================================================================
# WebSocket Streaming Handler (Legacy/Fallback)
# =========================================================================

@router.websocket("/ws/{equipment_id}")
async def stream_websocket(websocket: WebSocket, equipment_id: str):
    logger.info(f"WebSocket connection requested for equipment_id: {equipment_id}")
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for equipment: {equipment_id}")

    db = get_database()
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
        "equipment_name": equipment.get("name", "") if equipment else "",
        "equipment_description": equipment.get("description", "") if equipment else "",
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
