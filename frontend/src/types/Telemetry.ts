export interface MetricsPoint {
  timestamp: string; // e.g. "13:20:58"
  stt?: number | null; // DeepgramSTTService#0 in ms
  tts?: number | null; // ElevenLabsTTSService#0 in ms
  llm?: number | null; // GroqLLMService#0 in ms
}

export interface LatestTTFB {
  stt: number | null;
  tts: number | null;
  llm: number | null;
}

export interface PipelineEventItem {
  id: string;
  timestamp: string; // e.g. "13:20:57.123"
  type: string;
  details: string;
}
