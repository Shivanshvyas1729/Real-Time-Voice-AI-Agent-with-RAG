import { PipecatMetricsData } from "@pipecat-ai/client-js";
import { ChunkMetadata } from "./Chunk";

export type ChatMessage = {
  id: string;
  role: "user" | "bot" | "server";
  content: string;
  streaming?: boolean;
  metrics?: PipecatMetricsData;
  timestamp?: Date | string;
  user_id?: string;
  citations?: ChunkMetadata[];
};

