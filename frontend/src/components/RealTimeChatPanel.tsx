import { useState, useEffect, useRef } from "react";
import {
  TransportStateEnum,
  PipecatMetricsData,
} from "@pipecat-ai/client-js";
import {
  usePipecatClient,
  usePipecatClientTransportState,
} from "@pipecat-ai/client-react";
import api, { Equipment, getEquipmentList } from "@/utils/api";
import { ChatMessage } from "@/types/ChatMessage";
import { ChunkMetadata } from "@/types/Chunk";
import { LatestTTFB, MetricsPoint, PipelineEventItem } from "@/types/Telemetry";
import { getId, formatMessageTime } from "@/utils/chat";
import usePipecatChatEvents from "@/hooks/pipecat-chat-events";
import MetricsTab from "./MetricsTab";
import EventsDrawer from "./EventsDrawer";
import LeftMediaPanel from "./LeftMediaPanel";
import RightSidebar from "./RightSidebar";
import AdminModal from "./AdminModal";
import ToolCallAccordion from "./ToolCallAccordion";
import { Thinking } from "./pipecat/conversation-message";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "./ui/resizable";
import {
  Activity,
  Send,
  Moon,
  Sun,
  Phone,
  PanelRight,
  ChevronDown,
  Trash2,
} from "lucide-react";

interface RealTimeChatPanelProps {
  equipmentId?: string;
  onEquipmentChange?: (id: string) => void;
  transportType?: "webrtc" | "websocket";
  onTransportChange?: (type: "webrtc" | "websocket") => void;
}

export default function RealTimeChatPanel({
  equipmentId,
  onEquipmentChange,
  transportType = "webrtc",
  onTransportChange,
}: RealTimeChatPanelProps) {
  const client = usePipecatClient();
  const transportState = usePipecatClientTransportState();

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [selectedEqId, setSelectedEqId] = useState<string>(equipmentId || "");
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [chunksMetadata, setChunksMetadata] = useState<{ [key: string]: ChunkMetadata }>({});
  const [liveMetrics, setLiveMetrics] = useState<PipecatMetricsData | null>(null);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"conversation" | "metrics">("conversation");
  const [transcriptMode, setTranscriptMode] = useState<"text" | "karaoke" | "captions" | "raw">("text");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return (
      localStorage.getItem("theme") === "dark" ||
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });

  // Keep HTML document class synchronized with isDarkMode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  // Session Identifiers
  const [sessionId, setSessionId] = useState<string>("");
  const [participantId, setParticipantId] = useState<string>("");

  // Telemetry time-series & events
  const [eventLogs, setEventLogs] = useState<PipelineEventItem[]>([]);
  const [latestTTFB, setLatestTTFB] = useState<LatestTTFB>({
    stt: null,
    tts: null,
    llm: null,
  });
  const [metricsHistory, setMetricsHistory] = useState<MetricsPoint[]>([]);

  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const isConnected = transportState === TransportStateEnum.READY;
  const isConnecting =
    transportState === TransportStateEnum.CONNECTING ||
    transportState === TransportStateEnum.INITIALIZING ||
    transportState === TransportStateEnum.AUTHENTICATING;

  // Auto-scroll chat to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Load equipment list
  const loadEquipment = async () => {
    try {
      const data = await getEquipmentList();
      setEquipmentList(Array.isArray(data) ? data : []);
      if (!selectedEqId && Array.isArray(data) && data.length > 0 && data[0]._id) {
        setSelectedEqId(data[0]._id);
        onEquipmentChange?.(data[0]._id);
      }
    } catch (err) {
      console.error("Failed to load equipment list:", err);
    }
  };

  useEffect(() => {
    loadEquipment();
  }, []);

  const lastTurnTimeRef = useRef<number>(0);

  // Handle live metric updates after each real conversation turn
  const handleNewTurnMetrics = (stt: number | null, tts: number | null, llm: number | null) => {
    const validSTT = stt !== null && stt > 0 ? stt : null;
    const validTTS = tts !== null && tts > 0 ? tts : null;
    const validLLM = llm !== null && llm > 0 ? llm : null;

    if (!validSTT && !validTTS && !validLLM) return;

    setLatestTTFB((prev) => ({
      stt: validSTT !== null ? validSTT : prev.stt,
      tts: validTTS !== null ? validTTS : prev.tts,
      llm: validLLM !== null ? validLLM : prev.llm,
    }));

    const now = Date.now();
    const isSameTurn = now - lastTurnTimeRef.current < 4500;
    lastTurnTimeRef.current = now;

    setMetricsHistory((prev) => {
      if (isSameTurn && prev.length > 0) {
        const last = prev[prev.length - 1];
        const updated: MetricsPoint = {
          ...last,
          stt: validSTT !== null ? validSTT : last.stt,
          tts: validTTS !== null ? validTTS : last.tts,
          llm: validLLM !== null ? validLLM : last.llm,
        };
        return [...prev.slice(0, -1), updated];
      }

      const timeStr = new Date().toLocaleTimeString("en-US", { hour12: false });
      return [
        ...prev,
        {
          timestamp: timeStr,
          stt: validSTT,
          tts: validTTS,
          llm: validLLM,
        },
      ];
    });
  };

  // Subscribe to Pipecat events
  usePipecatChatEvents(
    setMessages,
    setChunksMetadata,
    setLiveMetrics,
    setEventLogs,
    handleNewTurnMetrics,
    setIsBotSpeaking,
    setIsThinking
  );

  // Connect handler
  const handleConnect = async () => {
    const eqId = selectedEqId || equipmentId;
    if (!eqId) {
      alert("Please select an equipment before connecting.");
      return;
    }

    if (
      transportState !== TransportStateEnum.DISCONNECTED &&
      transportState !== TransportStateEnum.DISCONNECTING
    ) {
      try {
        await handleDisconnect();
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (err) {
        console.error("Disconnect error before reconnect:", err);
      }
    }

    try {
      if (!client) throw new Error("Pipecat client is not initialized");

      setMessages([]);
      setEventLogs([]);

      const generatedSessionId = getId().slice(0, 18);
      const generatedPartId = getId().slice(0, 18);
      setSessionId(generatedSessionId);
      setParticipantId(generatedPartId);

      if (transportType === "webrtc") {
        await client.connect({
          webrtcRequestParams: {
            endpoint: "/api/offer",
            requestData: {
              equipment_id: eqId,
            },
          },
          iceConfig: {
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
          },
        });
      } else {
        const endpoint = (import.meta as any).env?.VITE_PIPECAT_ENDPOINT || "/stream/connect";
        const response = await api.post(endpoint, { equipment_id: eqId });
        if (!response.data?.ws_url) throw new Error("No ws_url received from server");
        await client.connect(response.data);
      }
    } catch (err: any) {
      console.error("Connection error:", err);
      alert(`Connection failed: ${err?.message || "Unknown error"}`);
    }
  };

  // Disconnect handler
  const handleDisconnect = async () => {
    try {
      if (
        transportState !== TransportStateEnum.DISCONNECTED &&
        transportState !== TransportStateEnum.DISCONNECTING
      ) {
        await client?.disconnect();
      }
    } catch (err) {
      console.error("Failed to disconnect cleanly:", err);
    }
  };

  // Send message
  const handleSendText = async () => {
    const payload = text.trim();
    if (!payload || !client) return;

    await client.sendText(payload);
    setMessages((prev) => [
      ...prev,
      { id: getId(), role: "user", content: payload, timestamp: new Date() },
    ]);
    setText("");
    setIsThinking(true);
  };

  // Mic mute toggle
  const handleToggleMic = () => {
    if (!client) return;
    const nextState = !isMicMuted;
    client.enableMic(!nextState);
    setIsMicMuted(nextState);
  };

  const selectedEquipment = equipmentList.find((e) => e._id === selectedEqId);

  // Compute total synthesized characters from metrics + bot speech messages
  const telemetryChars =
    liveMetrics?.characters?.reduce((acc, curr) => acc + (curr.value || 0), 0) || 0;
  const botMessageChars = messages
    .filter((m) => m.role === "bot")
    .reduce((acc, m) => acc + (m.content ? m.content.length : 0), 0);
  const totalCharacters = Math.max(telemetryChars, botMessageChars);

  return (
    <div
      className={`h-full w-full flex flex-col font-sans transition-colors duration-200 ${
        isDarkMode ? "bg-[#0b0f19] text-slate-100" : "bg-white text-slate-900"
      }`}
    >
      {/* Top Header Bar */}
      <header
        className={`h-12 border-b px-4 flex items-center justify-between select-none transition-colors duration-200 shrink-0 ${
          isDarkMode
            ? "border-slate-800 bg-[#0f172a] text-slate-100"
            : "border-slate-200 bg-white text-slate-900"
        }`}
      >
        {/* Left: Minimalist Waveform Brand Emblem + Title */}
        <div className="flex items-center gap-2.5">
          <div
            className={`h-7 w-7 rounded-md flex items-center justify-center ${
              isDarkMode
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                : "bg-slate-900 text-white"
            }`}
          >
            <Activity className="h-4 w-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight">
            Industrial Voice Agent
          </span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border hidden sm:inline ${
              isDarkMode
                ? "border-slate-700 bg-slate-800/60 text-slate-400"
                : "border-slate-200 bg-slate-50 text-slate-500"
            }`}
          >
            Pipecat 1.0 &middot; RAG
          </span>
        </div>

        {/* Right: Transport selector, Icons, Call Button */}
        <div className="flex items-center gap-2">
          {/* Transport Select */}
          <div className="relative">
            <select
              value={transportType}
              onChange={(e) => {
                const val = e.target.value as "webrtc" | "websocket";
                if (isConnected) {
                  handleDisconnect().then(() => {
                    onTransportChange?.(val);
                  });
                } else {
                  onTransportChange?.(val);
                }
              }}
              className={`appearance-none pl-3 pr-7 py-1 text-xs rounded-md border font-medium focus:outline-none cursor-pointer transition-colors ${
                isDarkMode
                  ? "border-slate-700 bg-slate-900 text-slate-200 focus:border-cyan-500"
                  : "border-slate-200 bg-white text-slate-800 focus:border-slate-400"
              }`}
            >
              <option value="webrtc">SmallWebRTC (Crystal Clear Opus)</option>
              <option value="websocket">WebSocket (Legacy PCM)</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-2 pointer-events-none" />
          </div>

          {/* Theme Toggle (Light / Dark) */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-1.5 rounded-md transition-colors ${
              isDarkMode
                ? "hover:bg-slate-800 text-amber-400"
                : "hover:bg-slate-100 text-slate-600"
            }`}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Call Indicator Icon */}
          <div
            className={`p-1.5 ${
              isConnected
                ? "text-emerald-500 animate-pulse"
                : isDarkMode
                ? "text-slate-600"
                : "text-slate-400"
            }`}
          >
            <Phone className="w-4 h-4" />
          </div>

          {/* Sidebar Toggle */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-1.5 rounded-md transition-colors ${
              isDarkMode
                ? "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
            }`}
            title="Toggle Sidebar"
          >
            <PanelRight className="w-4 h-4" />
          </button>

          {/* Connect / Disconnect Action Pill Button */}
          <button
            onClick={isConnected ? handleDisconnect : handleConnect}
            disabled={isConnecting}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-150 flex items-center gap-1.5 shadow-sm ${
              isConnected
                ? "bg-rose-600 hover:bg-rose-700 text-white"
                : isConnecting
                ? "bg-amber-600 hover:bg-amber-700 text-white animate-pulse"
                : isDarkMode
                ? "bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                : "bg-slate-900 hover:bg-slate-800 text-white"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? "bg-white"
                  : isConnecting
                  ? "bg-amber-200"
                  : isDarkMode
                  ? "bg-slate-950"
                  : "bg-emerald-400"
              }`}
            />
            {isConnected ? "Disconnect" : isConnecting ? "Connecting..." : "Connect"}
          </button>
        </div>
      </header>

      {/* Main Workspace Body with Resizable 3-Column Panes */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 w-full">
          {/* Left Column: Media & 16-Bar Canvas Spectrum Analyzer */}
          <ResizablePanel
            id="left-media"
            defaultSize="22%"
            minSize="16%"
            maxSize="35%"
            collapsible
            collapsedSize="5%"
          >
            <LeftMediaPanel
              selectedEquipment={selectedEquipment}
              isBotSpeaking={isBotSpeaking}
              isThinking={isThinking}
              isDarkMode={isDarkMode}
            />
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className={`transition-colors ${
              isDarkMode
                ? "bg-slate-800 hover:bg-cyan-500/80"
                : "bg-slate-200 hover:bg-indigo-500/80"
            }`}
          />

          {/* Center Column: Conversation & Metrics */}
          <ResizablePanel id="center-chat" defaultSize="54%" minSize="35%">
            <div
              className={`h-full flex flex-col min-w-0 transition-colors duration-200 ${
                isDarkMode ? "bg-[#0b0f19]" : "bg-white"
              }`}
            >
              {/* Tabs Bar */}
              <div
                className={`px-6 py-2.5 border-b flex items-center justify-between select-none shrink-0 ${
                  isDarkMode ? "border-slate-800 bg-[#0f172a]/60" : "border-slate-100 bg-white"
                }`}
              >
                {/* Conversation vs Metrics subtabs */}
                <div
                  className={`inline-flex p-0.5 rounded-lg border ${
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"
                  }`}
                >
                  <button
                    onClick={() => setActiveTab("conversation")}
                    className={`px-3 py-1 rounded-md text-xs transition-colors ${
                      activeTab === "conversation"
                        ? isDarkMode
                          ? "bg-slate-800 shadow-sm font-semibold text-white"
                          : "bg-white shadow-sm font-semibold text-slate-900"
                        : isDarkMode
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Conversation
                  </button>
                  <button
                    onClick={() => setActiveTab("metrics")}
                    className={`px-3 py-1 rounded-md text-xs transition-colors ${
                      activeTab === "metrics"
                        ? isDarkMode
                          ? "bg-slate-800 shadow-sm font-semibold text-white"
                          : "bg-white shadow-sm font-semibold text-slate-900"
                        : isDarkMode
                        ? "text-slate-400 hover:text-slate-200"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Metrics
                  </button>
                </div>

                {/* 4 Transcript Modes Selector: text | karaoke | captions | raw */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    Transcript:
                  </span>
                  <div className="relative">
                    <select
                      value={transcriptMode}
                      onChange={(e) =>
                        setTranscriptMode(
                          e.target.value as "text" | "karaoke" | "captions" | "raw"
                        )
                      }
                      className={`appearance-none pl-2.5 pr-6 py-1 text-xs rounded border focus:outline-none transition-colors cursor-pointer ${
                        isDarkMode
                          ? "border-slate-700 bg-slate-900 text-slate-200 focus:border-cyan-500"
                          : "border-slate-200 bg-white text-slate-700 focus:border-slate-400"
                      }`}
                    >
                      <option value="text">text (clean)</option>
                      <option value="karaoke">karaoke (dimmed unspoken)</option>
                      <option value="captions">captions (spoken-only)</option>
                      <option value="raw">raw stream (debug)</option>
                    </select>
                    <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-2 pointer-events-none" />
                  </div>

                  {messages.length > 0 && (
                    <button
                      onClick={() => setMessages([])}
                      title="Clear conversation"
                      className={`p-1 rounded border text-xs transition-colors ${
                        isDarkMode
                          ? "border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900/40 bg-slate-900/60"
                          : "border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 bg-white"
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Center Content: Conversation View OR Metrics View */}
              {activeTab === "conversation" ? (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Message History */}
                  <div
                    ref={listRef}
                    className="flex-1 overflow-y-auto px-6 py-4 space-y-5"
                  >
                    {messages.length === 0 && !isThinking ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                        <Activity className="w-8 h-8 mb-2 opacity-30" />
                        <p className="font-medium">No messages yet.</p>
                        <p className="text-[11px] mt-1 opacity-75">
                          Connect and speak through your microphone or type a query below.
                        </p>
                      </div>
                    ) : (
                      messages.map((m) => (
                        <div key={m.id} className="space-y-1">
                          {/* If this is a Tool Call, render the Tool Call Accordion */}
                          {m.role === "tool_call" && m.toolCall ? (
                            <ToolCallAccordion
                              toolCall={m.toolCall}
                              isDarkMode={isDarkMode}
                            />
                          ) : (
                            <>
                              {/* Role Label */}
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs font-semibold uppercase tracking-wider ${
                                    m.role === "bot"
                                      ? isDarkMode
                                        ? "text-cyan-400"
                                        : "text-indigo-600"
                                      : isDarkMode
                                      ? "text-sky-400"
                                      : "text-blue-600"
                                  }`}
                                >
                                  {m.role === "bot" ? "assistant" : "user"}
                                </span>
                                {m.streaming && (
                                  <span
                                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                      isDarkMode
                                        ? "bg-cyan-950/60 text-cyan-400 border border-cyan-800/40"
                                        : "bg-indigo-50 text-indigo-600 border border-indigo-200"
                                    }`}
                                  >
                                    streaming
                                  </span>
                                )}
                              </div>

                              {/* Content rendering based on transcriptMode */}
                              <div className="flex items-start justify-between gap-4">
                                {transcriptMode === "karaoke" ? (
                                  /* Karaoke Mode: spoken words illuminated, unspoken words dimmed */
                                  <div
                                    className={`text-sm leading-relaxed max-w-2xl whitespace-pre-wrap ${
                                      isDarkMode ? "text-slate-200" : "text-slate-800"
                                    }`}
                                  >
                                    {m.role === "bot" ? (
                                      (() => {
                                        const words = m.content.split(" ");
                                        const spokenCount = m.streaming
                                          ? m.spokenWordIndex !== undefined
                                            ? m.spokenWordIndex
                                            : Math.max(1, words.length - 2)
                                          : words.length;

                                        return words.map((word, wIdx) => {
                                          const isSpoken = wIdx < spokenCount;
                                          return (
                                            <span
                                              key={wIdx}
                                              className={`inline-block mr-1 transition-all duration-150 ${
                                                isSpoken
                                                  ? isDarkMode
                                                    ? "text-cyan-300 font-semibold drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                                                    : "text-indigo-600 font-semibold drop-shadow-[0_0_6px_rgba(99,102,241,0.5)]"
                                                  : isDarkMode
                                                  ? "opacity-50 text-slate-400"
                                                  : "opacity-40 text-slate-500"
                                              }`}
                                            >
                                              {word}
                                            </span>
                                          );
                                        });
                                      })()
                                    ) : (
                                      m.content
                                    )}
                                    {m.streaming && (
                                      <span
                                        className={`inline-block w-1.5 h-3.5 ml-1 align-middle animate-pulse ${
                                          isDarkMode ? "bg-cyan-400" : "bg-indigo-600"
                                        }`}
                                      />
                                    )}
                                  </div>
                                ) : transcriptMode === "captions" ? (
                                  /* Captions Mode: spoken-only (only words voiced so far appear) */
                                  <div
                                    className={`text-sm leading-relaxed max-w-2xl whitespace-pre-wrap ${
                                      isDarkMode ? "text-slate-200" : "text-slate-800"
                                    }`}
                                  >
                                    {m.role === "bot" ? (
                                      (() => {
                                        const words = m.content.split(" ");
                                        const spokenCount = m.streaming
                                          ? m.spokenWordIndex !== undefined
                                            ? m.spokenWordIndex
                                            : Math.max(1, words.length - 2)
                                          : words.length;
                                        const spokenText = words.slice(0, spokenCount).join(" ");

                                        return (
                                          <span>
                                            {spokenText}
                                            {m.streaming && (
                                              <span
                                                className={`inline-block w-1.5 h-3.5 ml-1 align-middle animate-pulse ${
                                                  isDarkMode ? "bg-cyan-400" : "bg-indigo-600"
                                                }`}
                                              />
                                            )}
                                          </span>
                                        );
                                      })()
                                    ) : (
                                      m.content
                                    )}
                                  </div>
                                ) : transcriptMode === "raw" ? (
                                  /* Raw Stream Mode: technical inspection with token indicators */
                                  <div
                                    className={`text-xs font-mono p-2.5 rounded-lg border leading-relaxed max-w-2xl w-full ${
                                      isDarkMode
                                        ? "border-slate-800 bg-[#0f172a] text-slate-300"
                                        : "border-slate-200 bg-slate-50 text-slate-800"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-[10px] text-slate-400 pb-1 mb-1 border-b border-slate-700/40">
                                      <span>ROLE: {m.role}</span>
                                      <span>LEN: {m.content.length} chars</span>
                                      <span>TOKENS: ~{Math.ceil(m.content.length / 4)}</span>
                                    </div>
                                    <div className="whitespace-pre-wrap">{m.content}</div>
                                    {m.streaming && (
                                      <span className="text-cyan-400 text-[10px] animate-pulse block mt-1">
                                        [STREAMING IN PROGRESS...]
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  /* Standard Text Mode: Clean conversation */
                                  <div
                                    className={`text-sm leading-relaxed max-w-2xl whitespace-pre-wrap ${
                                      isDarkMode ? "text-slate-200" : "text-slate-800"
                                    }`}
                                  >
                                    {m.content}
                                    {m.streaming && (
                                      <span
                                        className={`inline-block w-1.5 h-3.5 ml-1 align-middle animate-pulse ${
                                          isDarkMode ? "bg-cyan-400" : "bg-indigo-600"
                                        }`}
                                      />
                                    )}
                                  </div>
                                )}

                                {/* Timestamp */}
                                <span className="text-[11px] text-slate-400 flex-shrink-0 pt-0.5 select-none font-mono">
                                  {formatMessageTime(m.timestamp)}
                                </span>
                              </div>

                              {/* RAG Citations */}
                              {m.citations && m.citations.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-mono">
                                  {m.citations.map((c, idx) => {
                                    const meta = chunksMetadata[c.chunk_id];
                                    const fileName = meta?.file_name || c.file_name;
                                    return (
                                      <span
                                        key={idx}
                                        className={`px-1.5 py-0.5 rounded border transition-colors ${
                                          isDarkMode
                                            ? "border-slate-800 bg-slate-900/80 text-cyan-400"
                                            : "border-slate-200 bg-slate-50 text-slate-600"
                                        }`}
                                        title={`Chunk ID: ${c.chunk_id}`}
                                      >
                                        Source: {fileName} (Chunk #{c.chunk_index})
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))
                    )}

                    {/* Animated Typing Indicator when Groq LLM is thinking */}
                    {isThinking && (
                      <div className="space-y-1 animate-fadeIn">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-semibold uppercase tracking-wider ${
                              isDarkMode ? "text-cyan-400" : "text-indigo-600"
                            }`}
                          >
                            assistant
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                              isDarkMode
                                ? "bg-cyan-950/60 text-cyan-400 border border-cyan-800/40"
                                : "bg-indigo-50 text-indigo-600 border border-indigo-200"
                            }`}
                          >
                            thinking
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Thinking
                            className={`font-mono text-base font-bold tracking-widest ${
                              isDarkMode ? "text-cyan-400" : "text-indigo-600"
                            }`}
                          />
                          <span className="text-[11px] text-slate-400 font-mono">
                            Groq LLM processing response...
                          </span>
                        </div>
                      </div>
                    )}

                    <div ref={endRef} />
                  </div>

                  {/* Chat Input Bar */}
                  <div
                    className={`p-4 border-t transition-colors shrink-0 ${
                      isDarkMode
                        ? "border-slate-800 bg-[#0f172a]/60"
                        : "border-slate-100 bg-white"
                    }`}
                  >
                    <div
                      className={`flex items-center gap-2 max-w-3xl mx-auto border rounded-xl px-3 py-1.5 shadow-sm transition-colors ${
                        isDarkMode
                          ? "border-slate-800 bg-slate-900 focus-within:border-cyan-500"
                          : "border-slate-200 bg-white focus-within:border-slate-400"
                      }`}
                    >
                      <input
                        type="text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={
                          isConnected
                            ? "Type message..."
                            : "Connect to send text messages"
                        }
                        disabled={!isConnected}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && isConnected && text.trim()) {
                            handleSendText();
                          }
                        }}
                        className={`flex-1 text-xs bg-transparent focus:outline-none disabled:opacity-50 ${
                          isDarkMode
                            ? "text-slate-100 placeholder:text-slate-500"
                            : "text-slate-900 placeholder:text-slate-400"
                        }`}
                      />
                      <button
                        onClick={handleSendText}
                        disabled={!text.trim() || !isConnected}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isDarkMode
                            ? "text-slate-400 hover:text-cyan-400 disabled:opacity-30"
                            : "text-slate-400 hover:text-slate-900 disabled:opacity-30"
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Metrics View */
                <div className="flex-1 min-h-0">
                  <MetricsTab
                    latestTTFB={latestTTFB}
                    metricsHistory={metricsHistory}
                    totalCharacters={totalCharacters}
                    isDarkMode={isDarkMode}
                  />
                </div>
              )}
            </div>
          </ResizablePanel>

          {/* Right Column: Status, Equipment, Devices & Session */}
          {isSidebarOpen && (
            <>
              <ResizableHandle
                withHandle
                className={`transition-colors ${
                  isDarkMode
                    ? "bg-slate-800 hover:bg-cyan-500/80"
                    : "bg-slate-200 hover:bg-indigo-500/80"
                }`}
              />
              <ResizablePanel
                id="right-sidebar"
                defaultSize="24%"
                minSize="18%"
                maxSize="38%"
                collapsible
                collapsedSize="4%"
              >
                <RightSidebar
                  equipmentList={equipmentList}
                  selectedEquipmentId={selectedEqId}
                  onEquipmentChange={(id) => {
                    setSelectedEqId(id);
                    onEquipmentChange?.(id);
                  }}
                  onOpenAdmin={() => setIsAdminOpen(true)}
                  isConnected={isConnected}
                  isConnecting={isConnecting}
                  sessionId={sessionId}
                  participantId={participantId}
                  isMicMuted={isMicMuted}
                  onToggleMic={handleToggleMic}
                  isDarkMode={isDarkMode}
                  transportName={transportType === "webrtc" ? "SmallWebRTC (Opus)" : "WebSocket (PCM)"}
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Bottom Collapsible & Extendable Events Drawer */}
      <EventsDrawer events={eventLogs} isDarkMode={isDarkMode} />

      {/* Admin Management Modal */}
      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        equipmentList={equipmentList}
        selectedEquipmentId={selectedEqId}
        onEquipmentCreated={(newEq) => {
          loadEquipment();
          if (newEq._id) {
            setSelectedEqId(newEq._id);
            onEquipmentChange?.(newEq._id);
          }
        }}
      />
    </div>
  );
}
