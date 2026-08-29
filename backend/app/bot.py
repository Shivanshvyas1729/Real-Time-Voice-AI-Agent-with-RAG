"""
Pipecat Voice Bot Pipeline Engine Module

Constructs and executes the real-time AI voice pipeline using Pipecat 1.0 architecture:
- Deepgram Speech-To-Text (STT)
- Groq Language Model (LLM) with RAG tool calling (`search_knowledge_base`)
- ElevenLabs Text-To-Speech (TTS)
- RTVI Protocol Observer & FastAPI WebSocket Transport
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict
from dotenv import load_dotenv
from loguru import logger
from fastapi import WebSocket

from pipecat.audio.vad.silero import SileroVADAnalyzer, VADParams
from pipecat.adapters.schemas.tools_schema import FunctionSchema, ToolsSchema
from pipecat.frames.frames import (
    Frame,
    LLMMessagesAppendFrame,
    LLMRunFrame,
    TranscriptionFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
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

from app.config import settings
from app.services.rag import RAGService

load_dotenv(override=True)


class TextCaptureProcessor(FrameProcessor):
    """
    FrameProcessor that intercepts user LLMMessagesAppendFrame events and emits TranscriptionFrames downstream.

    Input:
        frame (Frame): Incoming audio/text frame in the pipeline.
        direction (FrameDirection): Flow direction (downstream/upstream).

    Output:
        Pushes a new `TranscriptionFrame` downstream if a user message is detected,
        then forwards the original `frame` unchanged so context aggregators receive it.
    """

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, LLMMessagesAppendFrame):
            for message in frame.messages:
                if message.get("role") == "user":
                    await self.push_frame(
                        TranscriptionFrame(
                            text=message.get("content", ""),
                            user_id="user",
                            timestamp=datetime.now(timezone.utc).isoformat(),
                        )
                    )

        await self.push_frame(frame, direction)


async def run_bot(transport: BaseTransport, session_data: Dict[str, Any]):
    """
    Constructs and runs the full Pipecat pipeline for a voice/text streaming session.

    Input:
        transport (BaseTransport): Inbound transport instance (FastAPIWebsocketTransport).
        session_data (Dict[str, Any]): Session context dictionary containing:
            - `equipment_id` (str): Target equipment ID.
            - `tenant_id` (str): Multi-tenant isolation ID.
            - `user_id` (str): User ID.

    Output:
        Runs `PipelineRunner` until socket disconnects or pipeline finishes.
    """
    logger.info("Starting voice bot pipeline...")

    equipment_id: str = session_data.get("equipment_id", "")
    tenant_id: str = session_data.get("tenant_id", settings.TENANT_ID)

    rag_service = RAGService()

    # 1. STT Service Setup (Deepgram Live Transcriber)
    live_options = LiveOptions(diarize=True)
    stt = DeepgramSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        live_options=live_options,
    )

    # 2. RTVI Processor (Pipecat RTVI Protocol Manager)
    rtvi = RTVIProcessor()

    # 3. Tool Definition & Callback for Vector Search
    async def search_knowledge_base(params: FunctionCallParams):
        """
        Tool Callback: Invoked by Groq LLM when looking up technical equipment manuals.

        Input:
            params (FunctionCallParams): Contains `arguments["query"]` search string.

        Output:
            Executes `rag_service.retrieve()`, invokes `params.result_callback()` with chunks,
            and emits an `RTVIServerMessageFrame` for UI citations rendering.
        """
        try:
            query = params.arguments.get("query", "")
            logger.info(f"RAG search: {query!r}")

            retrieval_result = await rag_service.retrieve(
                query=query,
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

            await rtvi.push_frame(
                RTVIServerMessageFrame(
                    data={
                        "type": "search_knowledge_base",
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
        description="Search the knowledge base for relevant information",
        properties={"query": {"type": "string"}},
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

    # 5. System Prompt, Universal Context & Aggregator Pair
    messages = [
        {
            "role": "system",
            "content": (
                "You are an AI equipment diagnostic assistant. "
                "You have access to the tool `search_knowledge_base`. "
                "ALWAYS call the `search_knowledge_base` tool whenever answering user questions about equipment, manuals, error codes, procedures, or technical specifications. "
                "Base your answers on the retrieved knowledge base data. Keep responses concise, clear, and under 30 words."
            ),
        },
    ]

    context = LLMContext(messages, tools=ToolsSchema(standard_tools=[search_tool]))
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context)

    # 6. TTS Service Setup (ElevenLabs Synthesizer)
    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY", ""),
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB"),
    )

    # 7. Construct Pipecat Pipeline
    pipeline = Pipeline([
        transport.input(),
        rtvi,
        TextCaptureProcessor(),
        stt,
        user_aggregator,
        llm,
        tts,
        transport.output(),
        assistant_aggregator,
    ])

    # 8. PipelineTask
    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        observers=[RTVIObserver(rtvi)],
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
        await task.cancel()

    # 10. PipelineRunner Execution
    runner = PipelineRunner(handle_sigint=False)
    await runner.run(task)


async def bot(websocket: WebSocket, session_data: Dict[str, Any]):
    """
    WebSocket Bot Handler Entrypoint.

    Input:
        websocket (WebSocket): Inbound FastAPI WebSocket connection.
        session_data (Dict[str, Any]): Session context containing equipment_id, tenant_id, user_id.

    Output:
        Initializes `FastAPIWebsocketTransport` with Silero VAD analyzer and Protobuf serializer,
        then delegates to `run_bot()`.
    """
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=ProtobufFrameSerializer(),
            vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.2)),
        ),
    )

    await run_bot(transport, session_data)


if __name__ == "__main__":
    from pipecat.runner.run import main
    main()
