import { BotJson } from "@/types/BotJson";
import { ChunkMetadata } from "@/types/Chunk";

export const getTextFromPayload = (data: any): string => {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (typeof data.text === "string") return data.text;
  if (typeof data.message === "string") return data.message;
  if (typeof data.token === "string") return data.token;
  if (typeof data.content === "string") return data.content;
  if (data?.text?.content && typeof data.text.content === "string")
    return data.text.content;
  if (data?.delta?.content && typeof data.delta.content === "string")
    return data.delta.content;
  if (Array.isArray(data?.choices) && data.choices[0]?.delta?.content)
    return data.choices[0].delta.content;
  if (Array.isArray(data?.output?.text)) return data.output.text.join("");
  return "";
};

export const getId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const formatMessageTime = (timestamp?: Date | string): string => {
  if (!timestamp) return "";
  
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  if (isNaN(date.getTime())) return "";
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (messageDate.getTime() === today.getTime()) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (messageDate.getTime() === yesterday.getTime()) {
    return `Yesterday ${date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })}`;
  }
  
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const cleanMarkdown = (text: string): string => {
  return text.replace(/```json/g, "").replace(/```/g, "");
};

export const parseBotJson = (text: string): BotJson | null => {
  try {
    const obj = JSON.parse(cleanMarkdown(text));
    if (
      typeof obj === "object" &&
      (obj.suggested_response ||
        obj.agent_guidance ||
        obj.facts ||
        obj.intent ||
        obj.sentiment)
    ) {
      return obj as BotJson;
    }
    return null;
  } catch {
    return null;
  }
};

export const parseTextWithCitations = (
  text: string,
  chunksMetadata: { [key: string]: ChunkMetadata }
): Array<{ type: 'text' | 'citation'; content: string; chunkId?: string }> => {
  const chunkIdPattern = /\[([a-f0-9-]+)\]/gi;
  const parts: Array<{ type: 'text' | 'citation'; content: string; chunkId?: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = chunkIdPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    const chunkId = match[1];
    const metadata = chunksMetadata[chunkId];
    const citationText = metadata && metadata.file_name ? metadata.file_name : match[0];
    
    parts.push({
      type: 'citation',
      content: citationText,
      chunkId: metadata ? chunkId : undefined,
    });

    lastIndex = chunkIdPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  if (parts.length === 0) {
    parts.push({
      type: 'text',
      content: text,
    });
  }

  return parts;
};

