import { useState, useRef, useEffect } from "react";
import { PipelineEventItem } from "@/types/Telemetry";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Search
} from "lucide-react";

interface EventsDrawerProps {
  events: PipelineEventItem[];
  isDarkMode?: boolean;
}

export default function EventsDrawer({
  events,
  isDarkMode = false,
}: EventsDrawerProps) {
  // Manual height adjustment in pixels (default: 180px)
  const [height, setHeight] = useState<number>(() => {
    const saved = localStorage.getItem("events_drawer_height");
    return saved ? Math.max(80, Math.min(Number(saved), 600)) : 180;
  });
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [filterText, setFilterText] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoScroll] = useState(true);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(180);

  // Auto-scroll to bottom as new events stream in
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll, height, isCollapsed]);

  // Persist manual height changes to localStorage
  useEffect(() => {
    localStorage.setItem("events_drawer_height", String(height));
  }, [height]);

  // Handle manual drag resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = height;
    if (isCollapsed) setIsCollapsed(false);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Dragging UP increases drawer height
      const deltaY = dragStartYRef.current - moveEvent.clientY;
      const maxHeight = Math.round(window.innerHeight * 0.75);
      const minHeight = 70;
      const nextHeight = Math.min(
        Math.max(dragStartHeightRef.current + deltaY, minHeight),
        maxHeight
      );
      setHeight(nextHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const filteredEvents = events.filter((e) => {
    if (!filterText.trim()) return true;
    const query = filterText.toLowerCase();
    return (
      e.type.toLowerCase().includes(query) ||
      e.details.toLowerCase().includes(query) ||
      e.timestamp.includes(query)
    );
  });

  const handleCopyLogs = () => {
    const raw = events
      .map((e) => `[${e.timestamp}] ${e.type}: ${e.details}`)
      .join("\n");
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getTagColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("metric") || t.includes("ttfb")) {
      return isDarkMode
        ? "text-cyan-400 bg-cyan-950/40 border-cyan-800/40"
        : "text-sky-700 bg-sky-50 border-sky-200";
    }
    if (t.includes("transcript") || t.includes("speaking")) {
      return isDarkMode
        ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40"
        : "text-emerald-700 bg-emerald-50 border-emerald-200";
    }
    if (t.includes("llm") || t.includes("rag")) {
      return isDarkMode
        ? "text-violet-400 bg-violet-950/40 border-violet-800/40"
        : "text-violet-700 bg-violet-50 border-violet-200";
    }
    return isDarkMode
      ? "text-slate-400 bg-slate-800/50 border-slate-700"
      : "text-slate-600 bg-slate-100 border-slate-200";
  };

  return (
    <div
      className={`border-t flex flex-col select-none relative transition-colors duration-200 ${
        isDarkMode
          ? "border-slate-800 bg-[#0b0f19] text-slate-200"
          : "border-slate-200 bg-white text-slate-800"
      }`}
    >
      {/* 1. Interactive Manual Drag Resize Handle Bar */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => setIsCollapsed(!isCollapsed)}
        className={`group h-2.5 w-full cursor-row-resize flex items-center justify-center transition-all select-none relative z-20 ${
          isDarkMode
            ? "hover:bg-cyan-500/20 bg-[#0f172a] border-b border-slate-800"
            : "hover:bg-indigo-500/20 bg-slate-100 border-b border-slate-200"
        } ${isDragging ? (isDarkMode ? "bg-cyan-500/30 ring-1 ring-cyan-500/40" : "bg-indigo-500/30 ring-1 ring-indigo-500/40") : ""}`}
        title="Click and drag up/down to adjust drawer height manually (Double click to toggle)"
      >
        {/* Visual Grip Pill */}
        <div
          className={`h-1 rounded-full transition-all duration-150 ${
            isDragging
              ? isDarkMode
                ? "bg-cyan-400 w-28"
                : "bg-indigo-600 w-28"
              : isDarkMode
              ? "bg-slate-700 group-hover:bg-cyan-400 w-14 group-hover:w-20"
              : "bg-slate-300 group-hover:bg-indigo-500 w-14 group-hover:w-20"
          }`}
        />
      </div>

      {/* 2. Drawer Header Bar */}
      <div
        className={`px-4 py-2 border-b flex items-center justify-between text-xs transition-colors ${
          isDarkMode
            ? "border-slate-800 bg-[#0f172a]/95 text-slate-300"
            : "border-slate-100 bg-white text-slate-700"
        }`}
      >
        {/* Left: Events Title & Badge */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1.5 font-semibold tracking-wider text-[11px] uppercase hover:opacity-80 transition-opacity"
          >
            {isCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>EVENTS</span>
          </button>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
              isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
            }`}
          >
            {events.length} logged
          </span>
          <span className="text-[10px] text-slate-400 hidden sm:inline font-mono">
            {!isCollapsed ? `${height}px` : "Collapsed"} &middot; Drag bar to resize
          </span>
        </div>

        {/* Right: Search, Preset Size Toggles, Copy */}
        <div className="flex items-center gap-2">
          {/* Search / Filter input */}
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter events..."
              className={`pl-6 pr-2 py-1 text-[11px] rounded border transition-colors focus:outline-none w-32 sm:w-44 ${
                isDarkMode
                  ? "border-slate-800 bg-slate-900 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500"
                  : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-slate-400"
              }`}
            />
          </div>

          {/* Copy logs */}
          <button
            onClick={handleCopyLogs}
            className={`p-1 rounded transition-colors ${
              isDarkMode
                ? "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                : "hover:bg-slate-100 text-slate-500 hover:text-slate-700"
            }`}
            title="Copy all logs"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Preset Height Buttons: Compact (130px) vs Expanded (320px) vs Max (500px) */}
          <button
            onClick={() => {
              setIsCollapsed(false);
              setHeight((prev) => (prev < 240 ? 320 : prev < 450 ? 500 : 140));
            }}
            className={`p-1 rounded transition-colors ${
              isDarkMode
                ? "hover:bg-slate-800 text-slate-400 hover:text-cyan-400"
                : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
            }`}
            title="Toggle preset heights (140px / 320px / 500px)"
          >
            {height >= 400 ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Expand / Collapse toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`p-1 rounded transition-colors ${
              isDarkMode
                ? "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                : "hover:bg-slate-100 text-slate-500 hover:text-slate-700"
            }`}
            title={isCollapsed ? "Open drawer" : "Collapse drawer"}
          >
            {isCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 3. Drawer Logs Body with dynamic manual height */}
      {!isCollapsed && (
        <div
          ref={logContainerRef}
          style={{ height: `${height}px` }}
          className={`overflow-y-auto p-3 font-mono text-[11px] leading-5 space-y-1 select-text transition-[height] duration-75 ${
            isDarkMode ? "bg-[#0b0f19] text-slate-300" : "bg-white text-slate-800"
          }`}
        >
          {filteredEvents.length === 0 ? (
            <div className="text-slate-400 italic text-center py-4">
              {events.length === 0
                ? "No events recorded yet. Connect to begin streaming."
                : "No matching events found."}
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div
                key={evt.id}
                className={`flex items-start gap-2.5 px-2 py-0.5 rounded transition-colors ${
                  isDarkMode ? "hover:bg-slate-900/80" : "hover:bg-slate-50"
                }`}
              >
                <span className="text-slate-500 select-none flex-shrink-0 text-[10px]">
                  {evt.timestamp}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded border text-[10px] font-semibold flex-shrink-0 ${getTagColor(
                    evt.type
                  )}`}
                >
                  {evt.type}
                </span>
                {evt.details && (
                  <span
                    className={`break-all text-[11px] font-normal ${
                      isDarkMode ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    {evt.details}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}