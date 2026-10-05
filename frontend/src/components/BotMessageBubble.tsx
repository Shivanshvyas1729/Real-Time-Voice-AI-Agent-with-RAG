import { ChatMessage } from "@/types/ChatMessage";
import { ChunkMetadata } from "@/types/Chunk";
import { parseBotJson, formatMessageTime } from "@/utils/chat";
import { getTTFBMs, getProcessingMs, getCharacterCount, getTTFBStatus } from "@/utils/metrics";
import { Bot, Zap, Clock, Type } from "lucide-react";
import { useMemo } from "react";
import BotJsonCard from "./BotJsonCard";

export default function BotMessageBubble({
  message,
  chunksMetadata,
}: {
  message: ChatMessage;
  chunksMetadata: { [key: string]: ChunkMetadata };
}) {
  /* Dark Theme Colors */
  const textColor = "#e2e8f0"; // slate-200
  const accentColor = "#3b82f6"; // Blue for streaming cursor

  // Parse JSON only when the message is finalized (not streaming)
  const botJson = useMemo(() => {
    if (message.streaming) return null;
    return parseBotJson(message.content);
  }, [message.streaming, message.content]);

  const ttfb = getTTFBMs(message.metrics);
  const processing = getProcessingMs(message.metrics);
  const characters = getCharacterCount(message.metrics);
  const ttfbStatus = getTTFBStatus(ttfb);

  return (
    <div className="flex items-start gap-4 animate-fadeIn group">
      {/* Bot avatar */}
      <div
        className="mt-0.5 rounded-sm p-1 flex-shrink-0"
        style={{
          background: "#10a37f", // ChatGPT-like green for bot
          color: "#ffffff",
        }}
        title="Bot"
      >
        <Bot className="h-4 w-4" />
      </div>

      {/* Bot bubble */}
      <div
        className="flex-1 min-w-0 text-sm leading-7"
        style={{
          color: textColor,
        }}
      >
        {botJson ? (
          <BotJsonCard data={botJson} chunksMetadata={chunksMetadata} />
        ) : (
          <>
            <pre className="whitespace-pre-wrap break-words font-sans text-slate-200">
              {message.content}
            </pre>
            {message.citations && message.citations.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-700">
                <p className="text-xs text-slate-400 mb-1">Sources:</p>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const uniqueCitations = message.citations.reduce((acc, chunk) => {
                      const exists = acc.find((c) => c.file_name === chunk.file_name);
                      if (!exists) {
                        acc.push(chunk);
                      }
                      return acc;
                    }, [] as ChunkMetadata[]);

                    return uniqueCitations.map((chunk) => (
                      <div
                        key={chunk.chunk_id}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 flex items-center gap-1"
                        title={chunk.file_name}
                      >
                        <span className="truncate max-w-[150px]">{chunk.file_name}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
            {message.streaming && (
              <span
                className="inline-block w-1.5 sm:w-2 h-3 sm:h-4 align-baseline animate-pulse ml-1 sm:ml-1.5 rounded-sm"
                style={{ backgroundColor: `${accentColor}60` }}
              />
            )}
          </>
        )}

        {/* Live Pipecat Metrics Badge */}
        {message.metrics && (ttfb !== null || processing !== null) && (
          <div className="mt-2.5 pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-[10px] font-mono">
            {ttfb !== null && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border transition-all ${ttfbStatus.badgeClass}`}
                title="Time-To-First-Byte (TTS Latency): Time until first synthesized audio chunk"
              >
                <Zap className="h-3 w-3" />
                <span>TTFB: {ttfb}ms</span>
              </span>
            )}

            {processing !== null && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-slate-300"
                title="Frame processing latency across pipeline processors"
              >
                <Clock className="h-3 w-3 text-blue-400" />
                <span>Proc: {processing}ms</span>
              </span>
            )}

            {characters !== null && (
              <span
                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-slate-400"
                title="Synthesized audio character count"
              >
                <Type className="h-3 w-3 text-purple-400" />
                <span>{characters} chars</span>
              </span>
            )}
          </div>
        )}

        {message.timestamp && !message.streaming && (
          <div className="mt-1.5 text-[10px] text-gray-500">
            {formatMessageTime(message.timestamp)}
          </div>
        )}
      </div>
    </div>
  );
}