import { useState } from "react";
import { PipecatMetricsData } from "@pipecat-ai/client-js";
import { Zap, Clock, Type, Activity, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { getTTFBMs, getProcessingMs, getCharacterCount, getTTFBStatus } from "@/utils/metrics";

interface LiveTelemetryBarProps {
  metrics: PipecatMetricsData | null;
  isConnected: boolean;
  isStreaming?: boolean;
}

export default function LiveTelemetryBar({
  metrics,
  isConnected,
  isStreaming = false,
}: LiveTelemetryBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const ttfb = getTTFBMs(metrics);
  const processing = getProcessingMs(metrics);
  const characters = getCharacterCount(metrics);
  const ttfbStatus = getTTFBStatus(ttfb);

  if (!isConnected && !metrics) {
    return null;
  }

  return (
    <div className="bg-slate-900/95 border-b border-slate-700/70 text-slate-300 text-xs shadow-inner">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Indicator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
            <span
              className={`h-2 w-2 rounded-full ${
                isStreaming
                  ? "bg-emerald-400 animate-ping"
                  : isConnected
                  ? "bg-emerald-400"
                  : "bg-slate-500"
              }`}
            />
            <span className="font-mono text-[10px] uppercase tracking-wider font-semibold text-slate-300">
              Pipeline Telemetry
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono text-emerald-400/90 bg-emerald-950/40 border border-emerald-900/50">
            <CheckCircle2 className="h-3 w-3" />
            <span>Sub-800ms SLA</span>
          </div>
        </div>

        {/* Center: Live Stats */}
        <div className="flex items-center gap-3 font-mono">
          {/* TTFB */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] transition-all ${ttfbStatus.badgeClass}`}
            title="Time-To-First-Byte: Latency until first audio packet is synthesized by TTS"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="text-slate-400 text-[10px]">TTFB:</span>
            <span className="font-bold font-mono">
              {ttfb !== null ? `${ttfb}ms` : isStreaming ? "Synthesizing..." : "--"}
            </span>
            {ttfb !== null && (
              <span className="hidden md:inline-block text-[9px] px-1 py-0.2 rounded bg-black/30 font-sans">
                {ttfbStatus.label}
              </span>
            )}
          </div>

          {/* Processing Latency */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-700/80 bg-slate-800/80 text-[11px]"
            title="Frame processing latency across pipeline processors"
          >
            <Clock className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-slate-400 text-[10px]">Processing:</span>
            <span className="font-semibold text-slate-200">
              {processing !== null ? `${processing}ms` : "--"}
            </span>
          </div>

          {/* Characters */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-700/80 bg-slate-800/80 text-[11px]"
            title="Total text characters synthesized into speech"
          >
            <Type className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-slate-400 text-[10px]">Chars:</span>
            <span className="font-semibold text-slate-200">
              {characters !== null ? characters : "--"}
            </span>
          </div>
        </div>

        {/* Right: Expand/Collapse button for raw breakdown */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          title="Toggle processor timing breakdown"
        >
          <Activity className="h-3 w-3 text-cyan-400" />
          <span className="hidden md:inline">Breakdown</span>
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Expanded Breakdown Drawer */}
      {isExpanded && (
        <div className="border-t border-slate-800 bg-slate-950/70 px-4 py-2.5 animate-fadeIn text-[11px] font-mono">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* TTFB Details */}
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 font-semibold mb-1">
                <span className="flex items-center gap-1 text-emerald-400">
                  <Zap className="h-3 w-3" /> Time-To-First-Byte (TTS)
                </span>
                <span>{ttfb !== null ? `${ttfb}ms` : "--"}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-sans">
                Target: &lt;200ms. Measured from first LLM token frame arrival at ElevenLabs/Cartesia until first PCM audio chunk emitted.
              </p>
              {metrics?.ttfb && metrics.ttfb.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {metrics.ttfb.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[10px] text-slate-400">
                      <span className="truncate max-w-[180px]">{item.processor}</span>
                      <span className="text-emerald-300">
                        {item.value < 10 ? Math.round(item.value * 1000) : Math.round(item.value)}ms
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Processing Details */}
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 font-semibold mb-1">
                <span className="flex items-center gap-1 text-blue-400">
                  <Clock className="h-3 w-3" /> Processing Latency
                </span>
                <span>{processing !== null ? `${processing}ms` : "--"}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-sans">
                Time spent inside Pipecat frame processors handling audio, transcription, and tool calls.
              </p>
              {metrics?.processing && metrics.processing.length > 0 && (
                <div className="mt-1.5 space-y-1 max-h-24 overflow-y-auto">
                  {metrics.processing.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[10px] text-slate-400">
                      <span className="truncate max-w-[180px]">{item.processor}</span>
                      <span className="text-blue-300">
                        {item.value < 10 ? Math.round(item.value * 1000) : Math.round(item.value)}ms
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Character & SLA Details */}
            <div className="p-2 rounded bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 font-semibold mb-1">
                <span className="flex items-center gap-1 text-purple-400">
                  <Type className="h-3 w-3" /> Audio Synthesis Volume
                </span>
                <span>{characters !== null ? `${characters} chars` : "--"}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-sans">
                Streaming model: <code className="text-slate-300">eleven_flash_v2_5</code>. Audio is transmitted as 16kHz PCM chunks over WebSockets.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}