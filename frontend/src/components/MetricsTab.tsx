import { useState } from "react";
import { LatestTTFB, MetricsPoint } from "@/types/Telemetry";
import { Clock } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface MetricsTabProps {
  latestTTFB: LatestTTFB;
  metricsHistory: MetricsPoint[];
  totalCharacters?: number;
  isDarkMode?: boolean;
}

const CustomTooltip = ({ active, payload, label, isDarkMode }: any) => {
  if (active && payload && payload.length) {
    return (
      <div
        className={`p-3 rounded-xl border shadow-xl text-xs font-mono ${
          isDarkMode
            ? "bg-[#0f172a] border-slate-700 text-slate-100"
            : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        <div className="font-semibold mb-1.5 text-slate-400">{label}</div>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 my-0.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: entry.color }}
            />
            <span className={isDarkMode ? "text-slate-300" : "text-slate-600"}>
              {entry.name}:
            </span>
            <span className="font-bold">
              {typeof entry.value === "number" ? entry.value.toFixed(1) : entry.value} ms
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function MetricsTab({
  latestTTFB,
  metricsHistory,
  totalCharacters = 0,
  isDarkMode = false,
}: MetricsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<"performance" | "usage">("performance");

  // Filter out any zero baseline points if real points exist
  const realPoints = metricsHistory.filter(
    (p) => (p.stt && p.stt > 0) || (p.tts && p.tts > 0) || (p.llm && p.llm > 0)
  );

  const displayPoints: MetricsPoint[] = realPoints.length > 0 ? realPoints : [];

  return (
    <div
      className={`h-full w-full flex flex-col p-6 overflow-y-auto transition-colors duration-200 ${
        isDarkMode ? "bg-[#0b0f19] text-slate-100" : "bg-white text-slate-900"
      }`}
    >
      {/* Sub-tabs header: Performance vs Usage matching Pipecat */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setActiveSubTab("performance")}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === "performance"
              ? isDarkMode
                ? "bg-slate-800 text-cyan-400 font-semibold shadow-sm"
                : "bg-slate-100 text-slate-900 font-semibold"
              : isDarkMode
              ? "text-slate-400 hover:text-slate-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Performance
        </button>
        <button
          onClick={() => setActiveSubTab("usage")}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            activeSubTab === "usage"
              ? isDarkMode
                ? "bg-slate-800 text-cyan-400 font-semibold shadow-sm"
                : "bg-slate-100 text-slate-900 font-semibold"
              : isDarkMode
              ? "text-slate-400 hover:text-slate-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Usage
        </button>
      </div>

      {activeSubTab === "performance" ? (
        <div className="flex-1 flex flex-col">
          {/* Top 3 KPI Cards matching Pipecat metrics tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            {/* Deepgram STT Card */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                isDarkMode
                  ? "bg-[#0f172a] border-slate-800"
                  : "bg-slate-50/60 border-slate-200"
              }`}
            >
              <div
                className={`text-xs font-medium mb-1 flex items-center justify-between ${
                  isDarkMode ? "text-slate-400" : "text-slate-500"
                }`}
              >
                <span>TTFB · DeepgramSTTService#0</span>
                <span className="w-2 h-2 rounded-full bg-sky-400" />
              </div>
              <div
                className={`text-3xl font-bold tracking-tight font-mono ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {latestTTFB.stt !== null && latestTTFB.stt > 0
                  ? latestTTFB.stt.toFixed(1)
                  : "—"}{" "}
                <span className="text-sm font-normal text-slate-400">ms</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Speech-to-text first partial transcription
              </div>
            </div>

            {/* ElevenLabs TTS Card */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                isDarkMode
                  ? "bg-[#0f172a] border-slate-800"
                  : "bg-slate-50/60 border-slate-200"
              }`}
            >
              <div
                className={`text-xs font-medium mb-1 flex items-center justify-between ${
                  isDarkMode ? "text-slate-400" : "text-slate-500"
                }`}
              >
                <span>TTFB · ElevenLabsTTSService#0</span>
                <span className="w-2 h-2 rounded-full bg-violet-400" />
              </div>
              <div
                className={`text-3xl font-bold tracking-tight font-mono ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {latestTTFB.tts !== null && latestTTFB.tts > 0
                  ? latestTTFB.tts.toFixed(1)
                  : "—"}{" "}
                <span className="text-sm font-normal text-slate-400">ms</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Audio synthesis first packet stream
              </div>
            </div>

            {/* Groq LLM Card */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                isDarkMode
                  ? "bg-[#0f172a] border-slate-800"
                  : "bg-slate-50/60 border-slate-200"
              }`}
            >
              <div
                className={`text-xs font-medium mb-1 flex items-center justify-between ${
                  isDarkMode ? "text-slate-400" : "text-slate-500"
                }`}
              >
                <span>TTFB · GroqLLMService#0</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <div
                className={`text-3xl font-bold tracking-tight font-mono ${
                  isDarkMode ? "text-white" : "text-slate-900"
                }`}
              >
                {latestTTFB.llm !== null && latestTTFB.llm > 0
                  ? latestTTFB.llm.toFixed(1)
                  : "—"}{" "}
                <span className="text-sm font-normal text-slate-400">ms</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Llama 3.3 70B RAG inference & first token
              </div>
            </div>
          </div>

          {/* Chart Header */}
          <div className="flex items-center justify-between mb-3">
            <span
              className={`text-xs font-medium uppercase tracking-wider ${
                isDarkMode ? "text-slate-400" : "text-slate-500"
              }`}
            >
              Time to First Byte Latency History (ms)
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {displayPoints.length} turn{displayPoints.length !== 1 ? "s" : ""} recorded
            </span>
          </div>

          {/* Recharts LineChart implementation matching official Pipecat chart.tsx */}
          <div
            className={`w-full p-4 rounded-xl border transition-all ${
              isDarkMode
                ? "bg-[#0f172a] border-slate-800"
                : "bg-slate-50/60 border-slate-200"
            }`}
          >
            {displayPoints.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
                <Clock className="w-8 h-8 mb-2 opacity-30 animate-pulse" />
                <p className="font-medium">No latency data recorded yet.</p>
                <p className="text-[11px] mt-1 opacity-75">
                  Speak a query to stream live TTFB performance metrics.
                </p>
              </div>
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={displayPoints}
                    margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke={isDarkMode ? "#1e293b" : "#e2e8f0"}
                      opacity={0.8}
                    />
                    <XAxis
                      dataKey="timestamp"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: isDarkMode ? "#94a3b8" : "#64748b", fontSize: 11 }}
                      tickMargin={10}
                      minTickGap={20}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: isDarkMode ? "#94a3b8" : "#64748b", fontSize: 11 }}
                      tickMargin={8}
                      width={50}
                      unit="ms"
                    />
                    <Tooltip content={<CustomTooltip isDarkMode={isDarkMode} />} />
                    <Legend
                      wrapperStyle={{ paddingTop: "15px" }}
                      formatter={(value) => (
                        <span
                          className={`text-xs font-medium ${
                            isDarkMode ? "text-slate-300" : "text-slate-700"
                          }`}
                        >
                          {value}
                        </span>
                      )}
                    />
                    <Line
                      type="linear"
                      dataKey="stt"
                      name="DeepgramSTTService#0"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#38bdf8", strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: "#38bdf8" }}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="linear"
                      dataKey="tts"
                      name="ElevenLabsTTSService#0"
                      stroke="#a855f7"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#a855f7", strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: "#a855f7" }}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="linear"
                      dataKey="llm"
                      name="GroqLLMService#0"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#34d399", strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: "#34d399" }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Usage Sub-tab matching Pipecat usage.tsx */
        <div className="space-y-4 max-w-lg">
          <div
            className={`p-4 rounded-xl border transition-all ${
              isDarkMode
                ? "bg-[#0f172a] border-slate-800"
                : "bg-slate-50 border-slate-200"
            }`}
          >
            <div
              className={`text-xs mb-1 font-medium ${
                isDarkMode ? "text-slate-400" : "text-slate-500"
              }`}
            >
              Synthesized Characters
            </div>
            <div
              className={`text-3xl font-bold font-mono tracking-tight ${
                isDarkMode ? "text-white" : "text-slate-900"
              }`}
            >
              {totalCharacters}{" "}
              <span className="text-base font-normal text-slate-400">chars</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Audio stream generated through ElevenLabs Flash v2.5 model.
            </p>
          </div>

          <div
            className={`p-4 rounded-xl border transition-all ${
              isDarkMode
                ? "bg-[#0f172a] border-slate-800"
                : "bg-slate-50 border-slate-200"
            }`}
          >
            <div
              className={`text-xs mb-1 font-medium ${
                isDarkMode ? "text-slate-400" : "text-slate-500"
              }`}
            >
              Recorded Turns
            </div>
            <div
              className={`text-3xl font-bold font-mono tracking-tight ${
                isDarkMode ? "text-white" : "text-slate-900"
              }`}
            >
              {displayPoints.length}{" "}
              <span className="text-base font-normal text-slate-400">turns</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Total conversational pipeline cycles tracked during this session.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
