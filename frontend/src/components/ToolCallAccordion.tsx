import React, { useState } from "react";
import { ToolCallData } from "@/types/ChatMessage";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  ChevronRight,
  LoaderCircle,
  Check,
  Copy,
  Database,
  Clock,
  Code2,
} from "lucide-react";

interface ToolCallAccordionProps {
  toolCall: ToolCallData;
  isDarkMode?: boolean;
}

export default function ToolCallAccordion({
  toolCall,
  isDarkMode = true,
}: ToolCallAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const isCompleted = toolCall.status === "completed";
  const hasResult = toolCall.result !== undefined && toolCall.result !== null;
  const chunkCount = Array.isArray(toolCall.result)
    ? toolCall.result.length
    : toolCall.result?.results
    ? toolCall.result.results.length
    : toolCall.result?.chunks
    ? toolCall.result.chunks.length
    : undefined;

  const handleCopyArgs = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!toolCall.args) return;
    navigator.clipboard.writeText(JSON.stringify(toolCall.args, null, 2));
    setCopiedArgs(true);
    setTimeout(() => setCopiedArgs(false), 2000);
  };

  const handleCopyResult = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!toolCall.result) return;
    navigator.clipboard.writeText(
      typeof toolCall.result === "string"
        ? toolCall.result
        : JSON.stringify(toolCall.result, null, 2)
    );
    setCopiedResult(true);
    setTimeout(() => setCopiedResult(false), 2000);
  };

  const queryArg = toolCall.args?.query || (toolCall.args && Object.values(toolCall.args)[0]);

  return (
    <div className="w-full my-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className={`rounded-xl border transition-all duration-200 overflow-hidden shadow-sm ${
            isDarkMode
              ? "border-slate-800 bg-[#0f172a]/90 text-slate-200"
              : "border-slate-200 bg-slate-50 text-slate-800"
          }`}
        >
          {/* Accordion Trigger Header */}
          <CollapsibleTrigger
            className={`w-full px-3.5 py-2.5 flex items-center justify-between text-xs transition-colors cursor-pointer select-none ${
              isDarkMode
                ? "hover:bg-slate-800/60"
                : "hover:bg-slate-100"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ChevronRight
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                  isOpen ? "rotate-90" : ""
                }`}
              />

              {/* Status Indicator */}
              <div className="shrink-0 flex items-center">
                {isCompleted ? (
                  <div className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  </div>
                )}
              </div>

              {/* Function Name and Query Pill */}
              <div className="flex items-center gap-2 truncate">
                <span className="font-mono font-semibold text-xs tracking-tight text-cyan-400">
                  {toolCall.function_name || "search_knowledge_base"}
                </span>

                {queryArg && (
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] truncate max-w-[220px] font-mono ${
                      isDarkMode
                        ? "bg-slate-800/80 text-slate-300 border border-slate-700/60"
                        : "bg-white text-slate-600 border border-slate-200"
                    }`}
                    title={String(queryArg)}
                  >
                    "{String(queryArg)}"
                  </span>
                )}
              </div>
            </div>

            {/* Badges: Latency & Chunks */}
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {chunkCount !== undefined && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                    isDarkMode
                      ? "bg-indigo-950/60 text-indigo-300 border border-indigo-800/40"
                      : "bg-indigo-50 text-indigo-600 border border-indigo-200"
                  }`}
                >
                  <Database className="w-2.5 h-2.5" />
                  {chunkCount} {chunkCount === 1 ? "chunk" : "chunks"}
                </span>
              )}

              {toolCall.duration_ms !== undefined && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    isDarkMode
                      ? "bg-slate-800/80 text-slate-400 border border-slate-700/50"
                      : "bg-white text-slate-500 border border-slate-200"
                  }`}
                >
                  <Clock className="w-2.5 h-2.5" />
                  {toolCall.duration_ms}ms
                </span>
              )}

              <span
                className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                  isCompleted
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-cyan-400 bg-cyan-500/10 animate-pulse"
                }`}
              >
                {isCompleted ? "COMPLETED" : "SEARCHING"}
              </span>
            </div>
          </CollapsibleTrigger>

          {/* Accordion Content Details */}
          <CollapsibleContent>
            <div
              className={`p-3.5 border-t space-y-3 text-xs font-mono transition-colors ${
                isDarkMode
                  ? "border-slate-800 bg-[#090d16]"
                  : "border-slate-200 bg-white"
              }`}
            >
              {/* Arguments Block */}
              {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 font-semibold">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Code2 className="w-3 h-3 text-cyan-400" />
                      Function Arguments
                    </span>
                    <button
                      onClick={handleCopyArgs}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                        isDarkMode
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                      title="Copy Arguments"
                    >
                      {copiedArgs ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre
                    className={`p-2.5 rounded-lg border overflow-x-auto text-xs whitespace-pre-wrap break-all ${
                      isDarkMode
                        ? "bg-[#0f172a] border-slate-800 text-cyan-300"
                        : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    {JSON.stringify(toolCall.args, null, 2)}
                  </pre>
                </div>
              )}

              {/* Result Block */}
              {hasResult && (
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 font-semibold">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Database className="w-3 h-3 text-indigo-400" />
                      Retrieved Knowledge Base Chunks (JSON)
                    </span>
                    <button
                      onClick={handleCopyResult}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                        isDarkMode
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      }`}
                      title="Copy Result JSON"
                    >
                      {copiedResult ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre
                    className={`p-2.5 rounded-lg border overflow-x-auto text-xs max-h-56 overflow-y-auto whitespace-pre-wrap break-all ${
                      isDarkMode
                        ? "bg-[#0f172a] border-slate-800 text-slate-200"
                        : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    {typeof toolCall.result === "string"
                      ? toolCall.result
                      : JSON.stringify(toolCall.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}
