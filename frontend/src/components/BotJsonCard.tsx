import { BotJson } from "@/types/BotJson";
import { ChunkMetadata } from "@/types/Chunk";
import { parseTextWithCitations } from "@/utils/chat";

export default function BotJsonCard({
  data,
  chunksMetadata,
}: {
  data: BotJson;
  chunksMetadata: { [key: string]: ChunkMetadata };
}) {
  return (
    <div className="space-y-3">


      {/* Suggested Response - Main Body */}
      <div className="text-sm text-slate-200 leading-relaxed max-w-none">
        {data.suggested_response}
      </div>

      {/* Facts with Citations */}
      {data.facts && data.facts.length > 0 && (
        <div className="pt-2 border-t border-slate-700/50 mt-1">
          <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Sources</div>
          <ul className="space-y-2">
            {data.facts.map((fact, idx) => {
              const parts = parseTextWithCitations(fact, chunksMetadata);
              return (
                <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                  <span className="text-slate-600 mt-1.5 text-[10px]">•</span>
                  <span className="leading-relaxed">
                    {parts.map((part, partIdx) => {
                      if (part.type === "citation") {
                        const metadata = part.chunkId ? chunksMetadata[part.chunkId] : null;
                        return (
                          <span
                            key={partIdx}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 text-xs rounded bg-slate-800 text-blue-400 border border-slate-700 hover:bg-slate-700 transition-colors cursor-help"
                            title={metadata ? `From: ${metadata.file_name}` : ""}
                          >
                            {part.content}
                          </span>
                        );
                      }
                      return <span key={partIdx}>{part.content}</span>;
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Sarcasm Detection */}
      {data.sarcasm?.detected && (
        <div className="p-2 rounded bg-yellow-50 border border-yellow-200">
          <div className="text-xs font-semibold text-yellow-800 mb-1">
            ⚠️ Sarcasm Detected ({(data.sarcasm.confidence * 100).toFixed(0)}%)
          </div>
          {data.sarcasm.reason && (
            <div className="text-xs text-yellow-700">{data.sarcasm.reason}</div>
          )}
          {data.sarcasm.type && (
            <div className="text-xs text-yellow-600 mt-1">
              Type: {data.sarcasm.type.replace("_", " ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

