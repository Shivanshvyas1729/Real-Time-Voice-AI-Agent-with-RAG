import { useState } from "react";
import { Equipment } from "@/utils/api";
import {
  Settings,
  Mic,
  MicOff,
  Copy,
  Check,
  
  
  
} from "lucide-react";
import { usePipecatClientMediaDevices } from "@pipecat-ai/client-react";

interface RightSidebarProps {
  equipmentList: Equipment[];
  selectedEquipmentId?: string;
  onEquipmentChange: (id: string) => void;
  onOpenAdmin: () => void;
  isConnected: boolean;
  isConnecting: boolean;
  sessionId?: string;
  participantId?: string;
  isMicMuted?: boolean;
  onToggleMic: () => void;
  isDarkMode?: boolean;
  transportName?: string;
}

export default function RightSidebar({
  equipmentList,
  selectedEquipmentId,
  onEquipmentChange,
  onOpenAdmin,
  isConnected,
  isConnecting,
  sessionId,
  participantId,
  isMicMuted = false,
  onToggleMic,
  isDarkMode = false,
  transportName = "SmallWebRTC",
}: RightSidebarProps) {
  const [copiedSession, setCopiedSession] = useState(false);
  const [copiedParticipant, setCopiedParticipant] = useState(false);

  // Native media devices from Pipecat
  const { availableMics, selectedMic, updateMic } = usePipecatClientMediaDevices();

  const handleCopy = (text: string, type: "session" | "participant") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === "session") {
      setCopiedSession(true);
      setTimeout(() => setCopiedSession(false), 2000);
    } else {
      setCopiedParticipant(true);
      setTimeout(() => setCopiedParticipant(false), 2000);
    }
  };

  return (
    <div
      className={`w-full h-full flex flex-col gap-5 p-4 overflow-y-auto text-xs transition-colors duration-200 ${
        isDarkMode
          ? "bg-[#0f172a] border-slate-800 text-slate-200"
          : "bg-white border-slate-200 text-slate-800"
      }`}
    >
      {/* STATUS Section matching screenshot */}
      <div>
        <div
          className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${
            isDarkMode ? "text-slate-400" : "text-slate-500"
          }`}
        >
          STATUS
        </div>
        <div
          className={`rounded-lg border p-2.5 space-y-2 ${
            isDarkMode ? "border-slate-800/80 bg-slate-900/50" : "border-slate-100 bg-slate-50/50"
          }`}
        >
          <div className="flex justify-between items-center py-0.5">
            <span className={isDarkMode ? "text-slate-300" : "text-slate-600"}>Client</span>
            <span
              className={`font-semibold tracking-wider text-[11px] font-mono flex items-center gap-1.5 ${
                isConnected
                  ? "text-emerald-500"
                  : isConnecting
                  ? "text-amber-500 animate-pulse"
                  : "text-slate-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    : isConnecting
                    ? "bg-amber-500"
                    : "bg-slate-500"
                }`}
              />
              {isConnected ? "READY" : isConnecting ? "CONNECTING" : "DISCONNECTED"}
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span className={isDarkMode ? "text-slate-300" : "text-slate-600"}>Agent</span>
            <span
              className={`font-semibold tracking-wider text-[11px] font-mono flex items-center gap-1.5 ${
                isConnected
                  ? "text-emerald-500"
                  : isConnecting
                  ? "text-amber-500 animate-pulse"
                  : "text-slate-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                    : isConnecting
                    ? "bg-amber-500"
                    : "bg-slate-500"
                }`}
              />
              {isConnected ? "READY" : isConnecting ? "CONNECTING" : "DISCONNECTED"}
            </span>
          </div>
        </div>
      </div>

      {/* EQUIPMENT Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-slate-500"
            }`}
          >
            EQUIPMENT
          </span>
          <button
            onClick={onOpenAdmin}
            className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${
              isDarkMode
                ? "text-cyan-400 hover:text-cyan-300"
                : "text-slate-600 hover:text-slate-900"
            }`}
            title="Open Admin Center"
          >
            <Settings className="w-3 h-3" />
            <span>Admin</span>
          </button>
        </div>

        <select
          value={selectedEquipmentId}
          onChange={(e) => onEquipmentChange(e.target.value)}
          disabled={isConnected || isConnecting}
          className={`w-full px-3 py-1.5 text-xs rounded-md border focus:outline-none disabled:opacity-50 transition-colors ${
            isDarkMode
              ? "border-slate-700 bg-slate-900 text-slate-100 focus:border-cyan-500"
              : "border-slate-200 bg-white text-slate-800 focus:border-slate-400"
          }`}
        >
          <option value="">Select Equipment</option>
          {equipmentList.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {/* DEVICES Section */}
      <div>
        <div
          className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${
            isDarkMode ? "text-slate-400" : "text-slate-500"
          }`}
        >
          DEVICES
        </div>

        <div className="space-y-2">
          <div className="relative">
            <select
              value={(selectedMic as MediaDeviceInfo)?.deviceId || ""}
              onChange={(e) => updateMic(e.target.value)}
              className={`w-full pl-3 pr-8 py-1.5 text-xs rounded-md border focus:outline-none transition-colors ${
                isDarkMode
                  ? "border-slate-700 bg-slate-900 text-slate-100 focus:border-cyan-500"
                  : "border-slate-200 bg-white text-slate-800 focus:border-slate-400"
              }`}
            >
              {availableMics.length > 0 ? (
                availableMics.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Microphone ${mic.deviceId.slice(0, 5)}...`}
                  </option>
                ))
              ) : (
                <option value="">Default Microphone</option>
              )}
            </select>
          </div>

          {/* Mic Mute / Unmute Button with green VU dots */}
          <button
            onClick={onToggleMic}
            className={`w-full py-1.5 px-3 rounded-md border text-xs flex items-center justify-center gap-2 transition-colors ${
              isMicMuted
                ? isDarkMode
                  ? "border-rose-900/60 bg-rose-950/30 text-rose-400 hover:bg-rose-900/40"
                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : isDarkMode
                ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            {isMicMuted ? (
              <>
                <MicOff className="w-3.5 h-3.5 text-rose-500" />
                <span>Microphone Muted</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-emerald-500" />
                <span>Microphone Active</span>
                <span className="text-emerald-500 font-bold ml-1 tracking-widest text-[10px]">
                  &bull;&bull;&bull;&bull;&bull;
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* SESSION Section matching screenshot */}
      <div
        className={`border-t pt-4 ${
          isDarkMode ? "border-slate-800 text-slate-400" : "border-slate-100 text-slate-600"
        }`}
      >
        <div
          className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${
            isDarkMode ? "text-slate-400" : "text-slate-500"
          }`}
        >
          SESSION
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span>Transport</span>
            <span
              className={`font-mono font-medium ${
                isDarkMode ? "text-slate-200" : "text-slate-900"
              }`}
            >
              {transportName}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span>Session ID</span>
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <span className="truncate max-w-[120px]">
                {sessionId ? `${sessionId.slice(0, 10)}...` : "None"}
              </span>
              {sessionId && (
                <button
                  onClick={() => handleCopy(sessionId, "session")}
                  className={`p-0.5 transition-colors ${
                    isDarkMode ? "text-slate-500 hover:text-slate-200" : "text-slate-400 hover:text-slate-900"
                  }`}
                  title="Copy Session ID"
                >
                  {copiedSession ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span>Participant ID</span>
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <span className="truncate max-w-[120px]">
                {participantId ? `${participantId.slice(0, 10)}...` : "None"}
              </span>
              {participantId && (
                <button
                  onClick={() => handleCopy(participantId, "participant")}
                  className={`p-0.5 transition-colors ${
                    isDarkMode ? "text-slate-500 hover:text-slate-200" : "text-slate-400 hover:text-slate-900"
                  }`}
                  title="Copy Participant ID"
                >
                  {copiedParticipant ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span>RTVI Client</span>
            <span className="font-mono">v1.4.1</span>
          </div>

          <div className="flex justify-between items-center">
            <span>RTVI Server</span>
            <span className="font-mono">v2.1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}