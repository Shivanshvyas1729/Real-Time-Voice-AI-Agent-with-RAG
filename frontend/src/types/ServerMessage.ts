import { ChunkMetadata } from "./Chunk";

export type ServerMessage = {
  type: string;
  chunks?: Array<{
    id: string;
    text: string;
    metadata: ChunkMetadata;
  }>;
  data?: any;
};

