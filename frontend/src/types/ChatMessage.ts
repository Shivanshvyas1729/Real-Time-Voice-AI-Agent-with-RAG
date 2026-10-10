import { PipecatMetricsData } from "@pipecat-ai/client-js";
import { ChunkMetadata } from "./Chunk";

export interface ToolCallData {
  tool_call_id?: string;
  function_name: string;
  args?: Record<string, any>;
  result?: any;
  status: "started" | "in_progress" | "completed";
  duration_ms?: number;
  timestamp?: Date | string;
  startedAt?: number;
}

export type ChatMessage = {
  id: string;
  role: "user" | "bot" | "server" | "tool_call";
  content: string;
  streaming?: boolean;
  metrics?: PipecatMetricsData;
  timestamp?: Date | string;
  user_id?: string;
  citations?: ChunkMetadata[];
  toolCall?: ToolCallData;
  spokenWordIndex?: number;
};
