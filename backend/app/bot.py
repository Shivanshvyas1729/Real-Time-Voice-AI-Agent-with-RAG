"""
Pipecat Voice Bot Pipeline Engine Module

Constructs and executes the real-time AI voice pipeline following Pipecat's
official architecture:
- Deepgram Speech-To-Text (STT)
- Universal LLM Context Aggregators with Silero VAD Analyzer
- Groq Language Model (LLM) with RAG tool calling (`search_knowledge_base`)
- ElevenLabs Text-To-Speech (TTS) using eleven_turbo_v2_5
- RTVI Protocol Observer & WebRTC/WebSocket Transport
"""

import os
from typing import Any, Dict
from dotenv import load_dotenv
from loguru import logger
from fastapi import WebSocket

from pipecat.audio.vad.silero import SileroVADAnalyzer, VADParams
from pipecat.adapters.schemas.tools_schema import FunctionSchema, ToolsSchema
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frameworks.rtvi import (
    RTVIObserver,
    RTVIProcessor,
    RTVIServerMessageFrame,
)
from pipecat.serializers.protobuf import ProtobufFrameSerializer
from pipecat.services.deepgram.stt import DeepgramSTTService, LiveOptions
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.groq.llm import GroqLLMService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)

from groq import AsyncGroq
from app.config import settings
from app.services.rag import RAGService

load_dotenv(override=True)


async def run_bot(transport: BaseTransport, session_data: Dict[str, Any]):
    """
    Constructs and runs the full Pipecat pipeline for a voice/text streaming session.

    Input:
        transport (BaseTransport): Inbound transport instance (SmallWebRTCTransport or FastAPIWebsocketTransport).
        session_data (Dict[str, Any]): Session context dictionary containing:
            - `equipment_id` (str): Target equipment ID.
            - `tenant_id` (str): Multi-tenant isolation ID.
            - `user_id` (str): User ID.

    Output:
        Runs `PipelineRunner` until socket disconnects or pipeline finishes.
    """
    logger.info("Starting voice bot pipeline (Pipecat Architecture)...")

    equipment_id: str = session_data.get("equipment_id", "")
    tenant_id: str = session_data.get("tenant_id", settings.TENANT_ID)
    equipment_name: str = session_data.get("equipment_name", "")
    equipment_desc: str = session_data.get("equipment_description", "")

    rag_service = RAGService()
    groq_async_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

    # Fallback: if equipment info wasn't in session_data, safely query MongoDB
    if not equipment_name and equipment_id:
        try:
            from app.database import get_database
            from bson import ObjectId
            db = get_database()
            if db is not None and ObjectId.is_valid(equipment_id):
                eq_doc = await db.equipment.find_one({"_id": ObjectId(equipment_id)})
                if eq_doc:
                    equipment_name = eq_doc.get("name", "")
                    equipment_desc = eq_doc.get("description", "")
        except Exception:
            pass

    async def enhance_query_with_llm(raw_query: str) -> str:
        """
        LLM-based Search Query Enhancer:
        Rewrites conversational or fragmented queries into rich semantic search queries
        specifically optimized for MongoDB Atlas Vector Store ($vectorSearch with BGE-M3 1024-dim embeddings).
        ONLY invoked when the LLM triggers search_knowledge_base.
        """
        if not raw_query or not raw_query.strip():
            return ""

        try:
            res = await groq_async_client.chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a technical search query optimizer for a MongoDB vector database containing industrial equipment manuals. "
                            "Rewrite the raw query into an optimal, highly specific search query (8 to 18 words) containing component names, "
                            "technical parameters, fault codes, or subsystem terms for dense vector embedding search. "
                            "Output ONLY the enhanced query string. Do NOT add preamble, quotes, or punctuation."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Equipment: {equipment_name}\nDescription: {equipment_desc}\nRaw query: {raw_query}\nEnhanced search query:",
                    },
                ],
                max_tokens=50,
                temperature=0.0,
            )
            enhanced = res.choices[0].message.content.strip().strip('"').strip("'")
            return enhanced or raw_query
        except Exception as err:
            logger.warning(f"LLM query enhancement failed, using raw query: {err}")
            return raw_query

    search_count = 0

    # 1. STT Service Setup (Deepgram Live Transcriber)
    stt = DeepgramSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        live_options=LiveOptions(
            model="nova-3",
            language="en-US",
            smart_format=True,
            punctuate=True,
            # interim_results and vad_events use Pipecat DeepgramSTTService defaults (True).
            # endpointing and utterance_end_ms intentionally omitted: Silero VAD controls turn-taking.
        ),
    )

    # 2. RTVI Processor (Pipecat RTVI Protocol Manager)
    rtvi = RTVIProcessor()

    # 3. Tool Definition & Callback for Vector Search
    async def search_knowledge_base(params: FunctionCallParams):
        """
        Tool Callback: Invoked by Groq LLM when looking up technical equipment manuals.
        """
        nonlocal search_count
        try:
            # Enforce hard limit of 3 searches per turn to prevent excessive latency loops
            if search_count >= 3:
                logger.warning(f"RAG search cap reached ({search_count}/3). Stopping query loop.")
                await params.result_callback({
                    "results": [],
                    "notice": "Maximum 3 searches reached for this question. Synthesize the final answer using retrieved documents.",
                })
                return
            search_count += 1

            raw_query = params.arguments.get("query", "")
            # Apply LLM-based query enhancement for MongoDB Vector Store
            enhanced_query = await enhance_query_with_llm(raw_query)
            logger.info(f"RAG search: raw={raw_query!r} -> LLM enhanced={enhanced_query!r}")

            retrieval_result = await rag_service.retrieve(
                query=enhanced_query,
                k=3,
                equipment_id=equipment_id,
                tenant_id=tenant_id,
            )

            clean_data = [
                {"id": meta.chunk_id, "content": chunk.text[:500]}
                for chunk, meta in zip(
                    retrieval_result.data,
                    retrieval_result.metadata.chunks,
                )
            ]

            await params.result_callback({"results": clean_data})

            # Send the real LLM-enhanced query to UI Accordion
            await rtvi.push_frame(
                RTVIServerMessageFrame(
                    data={
                        "type": "search_knowledge_base",
                        "query": enhanced_query,
                        "chunks": [
                            {
                                "id": meta.chunk_id,
                                "text": chunk.text,
                                "metadata": meta.model_dump(),
                            }
                            for chunk, meta in zip(
                                retrieval_result.data,
                                retrieval_result.metadata.chunks,
                            )
                        ],
                    }
                )
            )
        except Exception as e:
            logger.error(f"Error in search_knowledge_base: {e}", exc_info=True)
            await params.result_callback({"results": []})

    search_tool = FunctionSchema(
        name="search_knowledge_base",
        description=(
            "Search MongoDB vector knowledge base for equipment technical manuals, "
            "specifications, fault codes, tag identifiers, and maintenance procedures."
        ),
        properties={
            "query": {
                "type": "string",
                "description": (
                    "A rich, technical search query formulated for MongoDB Vector Search embedding. "
                    "Include the specific component name, parameter name, error code, or subsystem "
                    "(e.g., 'VFD acceleration ramp up profile seconds parameter', "
                    "'hydraulic suction isolation valve tag identifier'). "
                    "Never use conversational fragments like 'configured for' or single isolated words."
                ),
            }
        },
        required=["query"],
    )

    # 4. LLM Service Setup (Groq OpenAI-Compatible Client)
    llm = GroqLLMService(
        api_key=os.getenv("GROQ_API_KEY"),
        model=settings.GROQ_MODEL,
    )

    llm.register_function(
        "search_knowledge_base",
        search_knowledge_base,
        cancel_on_interruption=False,
    )

    # 5. System Prompt, Universal Context & Aggregator Pair (Pipecat Standard)
    messages = [
        {
            "role": "system",
            "content": (
                f"You are an AI equipment diagnostic assistant for: '{equipment_name or 'Industrial Equipment'}'. "
                f"{f'Description: {equipment_desc}. ' if equipment_desc else ''}"
                "You have access to the tool `search_knowledge_base` which queries the MongoDB vector store for technical documentation.\n"
                "SEARCH RULES:\n"
                "1. Always formulate detailed, technical search queries containing specific component names, parameter terms, or error codes (e.g., 'VFD acceleration ramp up profile seconds configuration', 'hydraulic suction isolation valve tag identifier').\n"
                "2. NEVER search short fragments like 'configured for' or conversational filler words.\n"
                "3. Perform at most 1 to 2 targeted searches per user question. Synthesize your final answer from the retrieved results.\n"
                "4. Do NOT call the tool for greetings, polite pleasantries, or general non-equipment conversation.\n"
                "5. Base your answers strictly on retrieved documentation. Keep spoken responses concise and under 40 words."
            ),
        },
    ]


    context = LLMContext(messages, tools=ToolsSchema(standard_tools=[search_tool]))
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    confidence=0.85,
                    start_secs=0.35,
                    stop_secs=0.4,
                )
            ),
        ),
    )

    # 6. TTS Service Setup (ElevenLabs Synthesizer - Pipecat Standard)
    # Uses eleven_turbo_v2_5 for fluent, uninterrupted speech without dropped words or phantom pauses.
    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY", ""),
        settings=ElevenLabsTTSService.Settings(
            voice=os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB"),
            model=os.getenv("ELEVENLABS_MODEL", "eleven_turbo_v2_5"),
        ),
        stop_frame_timeout_s=10.0,
    )

    # 7. Construct Pipecat Pipeline (Clean Pipecat Architecture)
    pipeline = Pipeline([
        transport.input(),
        stt,
        user_aggregator,
        llm,
        tts,
        transport.output(),
        assistant_aggregator,
    ])

    # 8. PipelineTask with Metrics & RTVI Observer (Pipecat Standard)
    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        rtvi_processor=rtvi,
    )

    # 9. Lifecycle Event Handlers
    @rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi_proc):
        await rtvi_proc.set_bot_ready()

    @transport.event_handler("on_client_connected")
    async def on_client_connected(trans, client):
        logger.info("Client connected")
        context.add_message({"role": "system", "content": "Say hello briefly."})
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(trans, client):
        logger.info("Client disconnected")
        await task.cancel()

    # 10. PipelineRunner Execution
    runner = PipelineRunner(handle_sigint=False)
    await runner.run(task)


async def bot(websocket: WebSocket, session_data: Dict[str, Any]):
    """
    WebSocket Bot Handler Entrypoint (Fallback).
    """
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=ProtobufFrameSerializer(),
        ),
    )

    await run_bot(transport, session_data)


if __name__ == "__main__":
    from pipecat.runner.run import main
    main()
