export type BotJson = {
  sentiment: string;
  intent: string;
  suggested_response: string;
  agent_guidance: string;
  facts: string[];
  sarcasm: {
    detected: boolean;
    confidence: number;
    reason: string | null;
    type: string | null;
  };
};

