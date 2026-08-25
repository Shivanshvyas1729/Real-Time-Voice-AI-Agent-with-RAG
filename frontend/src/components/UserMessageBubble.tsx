import { ChatMessage } from "@/types/ChatMessage";
import { formatMessageTime } from "@/utils/chat";
import { User } from "lucide-react";

export default function UserMessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-start gap-4 justify-end animate-fadeIn group">
      {/* User bubble */}
      <div
        className="max-w-[85%] rounded-xl px-4 py-3 text-sm shadow-sm bg-slate-700 text-slate-200"
      >
        <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed text-slate-200">
          {message.content}
        </pre>
        {message.timestamp && !message.streaming && (
          <div className="mt-1.5 text-[10px] text-slate-400">
            {formatMessageTime(message.timestamp)}
          </div>
        )}
      </div>

      {/* User avatar */}
      <div
        className="mt-0.5 rounded-sm p-1 flex-shrink-0 bg-slate-500 text-white"
        title="User"
      >
        <User className="h-4 w-4" />
      </div>
    </div>
  );
}

