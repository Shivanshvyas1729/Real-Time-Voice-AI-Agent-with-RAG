// React import not needed with JSX transform
import { Equipment } from "@/utils/api";
import { Volume2, Cpu, CheckCircle2 } from "lucide-react";
import { AudioVisualizerBar } from "@/components/pipecat/audio-visualizer-bar";

interface LeftMediaPanelProps {
  selectedEquipment?: Equipment | null;
  isBotSpeaking?: boolean;
  isThinking?: boolean;
  isDarkMode?: boolean;
}

export default function LeftMediaPanel({
  selectedEquipment,
  isBotSpeaking = false,
  isThinking = false,
  isDarkMode = false,
}: LeftMediaPanelProps) {
  return (
    <div
      className={`h-full w-full flex flex-col gap-3 p-3 overflow-y-auto transition-colors duration-200 ${
        isDarkMode
          ? "bg-[#0b0f19] text-slate-100"
          : "bg-slate-50/60 text-slate-900"
      }`}
    >
      {/* 16-Bar HTML5 Canvas Spectrum Visualizer matching Pipecat Studio aesthetic */}
      <div
        className={`rounded-xl border p-4 flex flex-col min-h-[190px] transition-all duration-200 shadow-sm shrink-0 ${
          isDarkMode
            ? "border-slate-800 bg-[#0f172a] text-slate-100"
            : "border-slate-200 bg-white text-slate-900"
        }`}
      >
        <div className="flex items-center justify-between text-xs mb-3">
          <div className="flex items-center gap-1.5 font-medium tracking-wide">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${
                isDarkMode ? "text-slate-400" : "text-slate-500"
              }`}
            >
              BOT AUDIO SPECTRUM
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-medium ${
                isBotSpeaking
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse"
                  : isThinking
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 animate-pulse"
                  : isDarkMode
                  ? "bg-slate-800 text-slate-500"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {isBotSpeaking ? "SPEAKING" : isThinking ? "THINKING" : "IDLE"}
            </span>
          </div>

          <div className="relative">
            {(isBotSpeaking || isThinking) && (
              <span className="absolute -inset-1 rounded-full bg-cyan-500/30 animate-ping" />
            )}
            <Volume2
              className={`w-4 h-4 transition-colors ${
                isBotSpeaking
                  ? "text-emerald-400 animate-pulse"
                  : isThinking
                  ? "text-cyan-400 animate-pulse"
                  : isDarkMode
                  ? "text-slate-600"
                  : "text-slate-400"
              }`}
            />
          </div>
        </div>

        {/* 16-Bar Canvas Frequency Spectrum Analyzer */}
        <div className="flex-1 flex flex-col items-center justify-center py-1">
          <div className="h-24 w-full flex items-center justify-center p-1">
            <AudioVisualizerBar
              participantType="bot"
              barCount={16}
              barWidth={6}
              barGap={4}
              barMaxHeight={68}
              barOrigin="center"
              barLineCap="round"
              isThinking={isThinking}
              barColor={isDarkMode ? "#22d3ee" : "#4f46e5"}
              className="w-full h-full"
            />
          </div>

          {/* Audio Activity Status Description */}
          <div className="mt-2 text-[10px] text-center font-mono select-none">
            {isBotSpeaking ? (
              <span className="text-emerald-400 font-medium tracking-wider flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                ELEVENLABS TTS ACTIVE (16 BARS)
              </span>
            ) : isThinking ? (
              <span className="text-cyan-400 font-medium tracking-wider flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                GROQ LLM THINKING...
              </span>
            ) : (
              <span className={isDarkMode ? "text-slate-500" : "text-slate-400"}>
                WebRTC Audio Monitor (Idle)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* EQUIPMENT SPECS (Clean technical panel replacing dead video box) */}
      <div
        className={`rounded-xl border p-4 flex flex-col flex-1 transition-all duration-200 shadow-sm ${
          isDarkMode
            ? "border-slate-800 bg-[#0f172a] text-slate-100"
            : "border-slate-200 bg-white text-slate-900"
        }`}
      >
        <div className="flex items-center justify-between text-xs mb-3">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}
          >
            EQUIPMENT SPECS
          </span>
          <Cpu
            className={`w-3.5 h-3.5 ${
              isDarkMode ? "text-slate-600" : "text-slate-400"
            }`}
          />
        </div>

        {selectedEquipment ? (
          <div className="space-y-3 text-xs">
            <div>
              <span
                className={`block text-[10px] uppercase font-semibold tracking-wider ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Machine Name
              </span>
              <span
                className={`font-medium block truncate ${
                  isDarkMode ? "text-slate-200" : "text-slate-900"
                }`}
              >
                {selectedEquipment.name}
              </span>
            </div>

            <div>
              <span
                className={`block text-[10px] uppercase font-semibold tracking-wider ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Status
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-500 font-medium text-[11px]">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                RAG Indexed & Ready
              </span>
            </div>

            <div>
              <span
                className={`block text-[10px] uppercase font-semibold tracking-wider ${
                  isDarkMode ? "text-slate-500" : "text-slate-400"
                }`}
              >
                Tenant ID
              </span>
              <span
                className={`font-mono block truncate text-[11px] ${
                  isDarkMode ? "text-slate-400" : "text-slate-600"
                }`}
              >
                {selectedEquipment.tenant_id}
              </span>
            </div>

            {selectedEquipment.description && (
              <div>
                <span
                  className={`block text-[10px] uppercase font-semibold tracking-wider ${
                    isDarkMode ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  Description
                </span>
                <p
                  className={`text-[11px] leading-relaxed line-clamp-3 ${
                    isDarkMode ? "text-slate-400" : "text-slate-600"
                  }`}
                >
                  {selectedEquipment.description}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`flex-1 flex flex-col items-center justify-center text-center p-2 text-xs ${
              isDarkMode ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <p>No equipment selected.</p>
            <p className="text-[10px] mt-1 opacity-80">
              Select a machine to load its technical manuals and RAG index.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
