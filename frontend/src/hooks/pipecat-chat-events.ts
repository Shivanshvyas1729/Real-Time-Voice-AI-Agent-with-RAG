import { useRef } from "react";
import { ChatMessage } from "@/types/ChatMessage";
import { ChunkMetadata } from "@/types/Chunk";
import { ServerMessage } from "@/types/ServerMessage";
import { PipelineEventItem } from "@/types/Telemetry";
import { getTextFromPayload, getId } from "@/utils/chat";
import {
  BotLLMTextData,
  BotOutputData,
  PipecatMetricsData,
  RTVIEvent,
  TranscriptData,
} from "@pipecat-ai/client-js";
import { useRTVIClientEvent } from "@pipecat-ai/client-react";

export default function usePipecatChatEvents(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setChunksMetadata: React.Dispatch<React.SetStateAction<{ [key: string]: ChunkMetadata }>>,
  setLiveMetrics?: React.Dispatch<React.SetStateAction<PipecatMetricsData | null>>,
  setEventLogs?: React.Dispatch<React.SetStateAction<PipelineEventItem[]>>,
  onNewTurnMetrics?: (stt: number | null, tts: number | null, llm: number | null) => void,
  setIsBotSpeaking?: React.Dispatch<React.SetStateAction<boolean>>,
  setIsThinking?: React.Dispatch<React.SetStateAction<boolean>>,
) {
  // --- Bot Turn Tracking Refs ---
  const currentStreamingBotMessageIdRef = useRef<string | null>(null);
  const pendingCitationsRef = useRef<ChunkMetadata[]>([]);
  const botTurnSourceRef = useRef<"llm" | "output" | null>(null);
  const isBotTurnActiveRef = useRef<boolean>(false);
  const botFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQueryRef = useRef<string>("");

  // --- User Turn Tracking Refs ---
  const currentUserMessageIdRef = useRef<string | null>(null);
  const committedUserTextRef = useRef<string>("");

  const finalizeBotMessage = () => {
    if (botFinalizeTimerRef.current) {
      clearTimeout(botFinalizeTimerRef.current);
      botFinalizeTimerRef.current = null;
    }

    setMessages((prev) => {
      const next = [...prev];
      if (currentStreamingBotMessageIdRef.current) {
        const idx = next.findIndex((m) => m.id === currentStreamingBotMessageIdRef.current);
        if (idx >= 0 && next[idx].streaming) {
          next[idx] = {
            ...next[idx],
            streaming: false,
            timestamp: next[idx].timestamp || new Date(),
          };
        }
      } else {
        const lastBotIdx = next
          .slice()
          .reverse()
          .findIndex((m) => m.role === "bot" && m.streaming);
        if (lastBotIdx >= 0) {
          const actualIdx = next.length - 1 - lastBotIdx;
          next[actualIdx] = {
            ...next[actualIdx],
            streaming: false,
            timestamp: next[actualIdx].timestamp || new Date(),
          };
        }
      }
      return next;
    });

    currentStreamingBotMessageIdRef.current = null;
    botTurnSourceRef.current = null;
    isBotTurnActiveRef.current = false;
    pendingCitationsRef.current = [];
    setIsThinking?.(false);
  };

  const finalizeUserMessage = () => {
    setMessages((prev) => {
      const next = [...prev];
      if (currentUserMessageIdRef.current) {
        const idx = next.findIndex((m) => m.id === currentUserMessageIdRef.current);
        if (idx >= 0 && next[idx].streaming) {
          next[idx] = {
            ...next[idx],
            streaming: false,
            timestamp: next[idx].timestamp || new Date(),
          };
        }
      } else {
        const lastUserIdx = next
          .slice()
          .reverse()
          .findIndex((m) => m.role === "user" && m.streaming);
        if (lastUserIdx >= 0) {
          const actualIdx = next.length - 1 - lastUserIdx;
          next[actualIdx] = {
            ...next[actualIdx],
            streaming: false,
            timestamp: next[actualIdx].timestamp || new Date(),
          };
        }
      }
      return next;
    });
  };

  const logEvent = (type: string, details: string = "") => {
    if (!setEventLogs) return;
    const now = new Date();
    const timeStr =
      now.toTimeString().split(" ")[0] +
      "." +
      String(now.getMilliseconds()).padStart(3, "0");
    setEventLogs((prev) => [
      ...prev,
      {
        id: getId(),
        timestamp: timeStr,
        type,
        details,
      },
    ]);
  };

  // 1. Server Message (RAG Search Results & Knowledge Chunks)
  useRTVIClientEvent(RTVIEvent.ServerMessage, (data: ServerMessage) => {
    if (data.type === "search_knowledge_base") {
      const newChunks = data.chunks?.map((c) => c.metadata) || [];
      setChunksMetadata((prev) => ({
        ...prev,
        ...(data.chunks?.reduce((acc, chunk) => {
          acc[chunk.metadata.chunk_id] = chunk.metadata;
          return acc;
        }, {} as { [key: string]: ChunkMetadata }) || {}),
      }));
      pendingCitationsRef.current = newChunks;
      logEvent(
        "ragQuery",
        JSON.stringify({ tool: "search_knowledge_base", chunksFound: newChunks.length })
      );

      // Attach or create the Tool Call Accordion item in messages
      setMessages((prev) => {
        const next = [...prev];
        const idx = next.slice().reverse().findIndex((m) => m.role === "tool_call");
        if (idx >= 0) {
          const actualIdx = next.length - 1 - idx;
          const startedAt = next[actualIdx].toolCall?.startedAt || Date.now();
          const queryUsed = data.query || next[actualIdx].toolCall?.args?.query || pendingQueryRef.current || "technical equipment search";
          next[actualIdx] = {
            ...next[actualIdx],
            toolCall: {
              ...next[actualIdx].toolCall!,
              args: { query: queryUsed },
              result: data.chunks,
              status: "completed",
              duration_ms: Math.max(80, Date.now() - startedAt),
            },
          };
          return next;
        }

        // Auto-generate tool call accordion entry if not already present
        next.push({
          id: getId(),
          role: "tool_call",
          content: "",
          timestamp: new Date(),
          toolCall: {
            tool_call_id: getId(),
            function_name: "search_knowledge_base",
            args: {
              query: data.query || pendingQueryRef.current || "technical equipment search",
            },
            result: data.chunks,
            status: "completed",
            duration_ms: 125,
            startedAt: Date.now() - 125,
          },
        });
        return next;
      });
    }
  });

  // 1b. LLM Function Call Events
  useRTVIClientEvent(RTVIEvent.LLMFunctionCallStarted, (data: any) => {
    logEvent("functionCallStarted", JSON.stringify(data));
    const fnName = data?.function_name || "search_knowledge_base";
    setMessages((prev) => [
      ...prev,
      {
        id: getId(),
        role: "tool_call",
        content: "",
        timestamp: new Date(),
        toolCall: {
          tool_call_id: data?.tool_call_id || getId(),
          function_name: fnName,
          args: data?.arguments?.query ? { query: data.arguments.query } : { query: "Optimizing search query with LLM..." },
          status: "started",
          startedAt: Date.now(),
        },
      },
    ]);
  });

  useRTVIClientEvent(RTVIEvent.LLMFunctionCallInProgress, (data: any) => {
    logEvent("functionCallInProgress", JSON.stringify(data));
    setMessages((prev) => {
      const next = [...prev];
      const idx = next.slice().reverse().findIndex((m) => m.role === "tool_call");
      if (idx >= 0) {
        const actualIdx = next.length - 1 - idx;
        next[actualIdx] = {
          ...next[actualIdx],
          toolCall: {
            ...next[actualIdx].toolCall!,
            status: "in_progress",
            args: data?.arguments || data?.args || next[actualIdx].toolCall?.args,
          },
        };
      }
      return next;
    });
  });

  useRTVIClientEvent(RTVIEvent.LLMFunctionCallStopped, (data: any) => {
    logEvent("functionCallStopped", JSON.stringify(data));
    setMessages((prev) => {
      const next = [...prev];
      const idx = next.slice().reverse().findIndex((m) => m.role === "tool_call");
      if (idx >= 0) {
        const actualIdx = next.length - 1 - idx;
        const startedAt = next[actualIdx].toolCall?.startedAt || Date.now();
        next[actualIdx] = {
          ...next[actualIdx],
          toolCall: {
            ...next[actualIdx].toolCall!,
            status: "completed",
            duration_ms: Math.max(60, Date.now() - startedAt),
          },
        };
      }
      return next;
    });
  });

  // 2. User Speaking States
  useRTVIClientEvent(RTVIEvent.UserStartedSpeaking, () => {
    logEvent("userStartedSpeaking");
    // Interruption: finalize any active bot speech immediately
    finalizeBotMessage();
    setIsThinking?.(false);

    // Start fresh user turn
    currentUserMessageIdRef.current = null;
    committedUserTextRef.current = "";
  });

  useRTVIClientEvent(RTVIEvent.UserStoppedSpeaking, () => {
    logEvent("userStoppedSpeaking");
    // Finalize current user speech bubble
    finalizeUserMessage();
    // User finished speaking: Groq LLM is now processing
    setIsThinking?.(true);
  });

  // 3. User Transcripts (Continuous Utterance Accumulation across multi-segment finals)
  useRTVIClientEvent(RTVIEvent.UserTranscript, (data: TranscriptData) => {
    const raw = getTextFromPayload(data).trim();
    const isFinal = !!data?.final;
    const userId = data?.user_id;
    if (!raw) return;

    pendingQueryRef.current = raw;
    logEvent("userTranscript", JSON.stringify({ text: raw, final: isFinal }));

    // Calculate full content of this user turn so far
    let fullContent = "";
    if (committedUserTextRef.current) {
      fullContent = `${committedUserTextRef.current} ${raw}`;
    } else {
      fullContent = raw;
    }

    if (isFinal) {
      // Commit this segment so subsequent segments in the same turn append to it
      committedUserTextRef.current = fullContent;
    }

    setMessages((prev) => {
      const next = [...prev];

      // Avoid duplicating typed messages echoed by TextCaptureProcessor
      if (userId === "user") {
        const lastUser = next.slice().reverse().find((m) => m.role === "user");
        if (lastUser && lastUser.content.trim() === raw) {
          return prev;
        }
      }

      // Check if we already have an active message for this user turn
      let existingIndex = -1;
      if (currentUserMessageIdRef.current) {
        existingIndex = next.findIndex((m) => m.id === currentUserMessageIdRef.current);
      }

      if (existingIndex < 0) {
        const lastIdx = next
          .slice()
          .reverse()
          .findIndex((m) => m.role === "user" && m.streaming);
        if (lastIdx >= 0) {
          existingIndex = next.length - 1 - lastIdx;
          currentUserMessageIdRef.current = next[existingIndex].id;
        }
      }

      if (existingIndex >= 0) {
        next[existingIndex] = {
          ...next[existingIndex],
          content: fullContent,
          streaming: !isFinal,
          timestamp: new Date(),
          user_id: userId || next[existingIndex].user_id,
        };
        return next;
      }

      // Brand new user turn
      const newMessageId = getId();
      currentUserMessageIdRef.current = newMessageId;
      next.push({
        id: newMessageId,
        role: "user",
        content: fullContent,
        streaming: !isFinal,
        timestamp: new Date(),
        user_id: userId,
      });
      return next;
    });
  });

  // 4. Bot Speaking States
  useRTVIClientEvent(RTVIEvent.BotStartedSpeaking, () => {
    setIsBotSpeaking?.(true);
    setIsThinking?.(false);
    logEvent("botStartedSpeaking");
    isBotTurnActiveRef.current = true;
    if (botFinalizeTimerRef.current) {
      clearTimeout(botFinalizeTimerRef.current);
      botFinalizeTimerRef.current = null;
    }
  });

  useRTVIClientEvent(RTVIEvent.BotStoppedSpeaking, () => {
    setIsBotSpeaking?.(false);
    logEvent("botStoppedSpeaking");

    // Don't finalize immediately; wait 500ms in case bot resumes speaking
    if (botFinalizeTimerRef.current) {
      clearTimeout(botFinalizeTimerRef.current);
    }
    botFinalizeTimerRef.current = setTimeout(() => {
      finalizeBotMessage();
    }, 500);
  });

  // Bot Output (Synthesized sentences or spoken words from TTS)
  useRTVIClientEvent(RTVIEvent.BotOutput, (data: BotOutputData) => {
    const rawText = (data as any)?.text ? String((data as any).text) : "";
    if (rawText) {
      logEvent("botOutput", rawText);
    }
    const token = rawText.trim();
    if (!token) return;

    if (botFinalizeTimerRef.current) {
      clearTimeout(botFinalizeTimerRef.current);
      botFinalizeTimerRef.current = null;
    }

    // Bot started outputting text, stop thinking indicator
    setIsThinking?.(false);

    // 1. If LLM streaming already owns this message, DO NOT append duplicate text!
    if (botTurnSourceRef.current === "llm") {
      // Still update spoken word index if spoken text is provided
      if ((data as any)?.spoken) {
        const spokenWords = String((data as any).spoken).trim().split(/\s+/).filter(Boolean).length;
        setMessages((prev) => {
          const next = [...prev];
          const lastBotIdx = next.slice().reverse().findIndex((m) => m.role === "bot" && m.streaming);
          if (lastBotIdx >= 0) {
            const actualIdx = next.length - 1 - lastBotIdx;
            next[actualIdx] = {
              ...next[actualIdx],
              spokenWordIndex: spokenWords,
            };
          }
          return next;
        });
      }
      return;
    }

    // 2. If this is a word-level token and we are receiving sentence frames, skip word frames
    if (data?.aggregated_by === "word" && (data as any)?.spoken) {
      const spokenWords = String((data as any).spoken).trim().split(/\s+/).filter(Boolean).length;
      setMessages((prev) => {
        const next = [...prev];
        const lastBotIdx = next.slice().reverse().findIndex((m) => m.role === "bot" && m.streaming);
        if (lastBotIdx >= 0) {
          const actualIdx = next.length - 1 - lastBotIdx;
          next[actualIdx] = {
            ...next[actualIdx],
            spokenWordIndex: spokenWords,
          };
        }
        return next;
      });
      return;
    }

    botTurnSourceRef.current = "output";
    isBotTurnActiveRef.current = true;

    setMessages((prev) => {
      const next = [...prev];
      let existingIndex = -1;
      if (currentStreamingBotMessageIdRef.current) {
        existingIndex = next.findIndex((m) => m.id === currentStreamingBotMessageIdRef.current);
      }
      if (existingIndex < 0) {
        const lastBotIdx = next
          .slice()
          .reverse()
          .findIndex((m) => m.role === "bot" && m.streaming);
        if (lastBotIdx >= 0) {
          existingIndex = next.length - 1 - lastBotIdx;
          currentStreamingBotMessageIdRef.current = next[existingIndex].id;
        }
      }

      if (existingIndex >= 0) {
        const currentContent = next[existingIndex].content;
        const needsSpace =
          currentContent.length > 0 &&
          !currentContent.endsWith(" ") &&
          !token.startsWith(" ") &&
          !/^[.,!?;:]/.test(token);
        const updatedContent = currentContent + (needsSpace ? " " : "") + token;

        next[existingIndex] = {
          ...next[existingIndex],
          content: updatedContent,
          streaming: true,
          citations:
            next[existingIndex].citations ||
            (pendingCitationsRef.current.length > 0
              ? pendingCitationsRef.current
              : undefined),
        };
      } else {
        const newMessageId = getId();
        const citations = pendingCitationsRef.current;

        next.push({
          id: newMessageId,
          role: "bot",
          content: token,
          streaming: true,
          timestamp: new Date(),
          citations: citations.length > 0 ? citations : undefined,
        });
        currentStreamingBotMessageIdRef.current = newMessageId;
      }
      return next;
    });
  });

  // 5. Bot LLM Tokens
  useRTVIClientEvent(RTVIEvent.BotLlmStarted, () => {
    logEvent("botLlmStarted");
    setIsThinking?.(true);
    if (botFinalizeTimerRef.current) {
      clearTimeout(botFinalizeTimerRef.current);
      botFinalizeTimerRef.current = null;
    }

    // New bot turn starting: ensure previous user message is finalized and reset user turn refs
    finalizeUserMessage();
    currentUserMessageIdRef.current = null;
    committedUserTextRef.current = "";

    isBotTurnActiveRef.current = true;
  });

  useRTVIClientEvent(RTVIEvent.BotLlmText, (data: BotLLMTextData) => {
    const token = getTextFromPayload(data);
    if (!token) return;

    setIsThinking?.(false);

    if (botFinalizeTimerRef.current) {
      clearTimeout(botFinalizeTimerRef.current);
      botFinalizeTimerRef.current = null;
    }

    botTurnSourceRef.current = "llm";
    isBotTurnActiveRef.current = true;

    setMessages((prev) => {
      const next = [...prev];
      let existingIndex = -1;
      if (currentStreamingBotMessageIdRef.current) {
        existingIndex = next.findIndex((m) => m.id === currentStreamingBotMessageIdRef.current);
      }
      if (existingIndex < 0) {
        const lastBotIdx = next
          .slice()
          .reverse()
          .findIndex((m) => m.role === "bot" && m.streaming);
        if (lastBotIdx >= 0) {
          existingIndex = next.length - 1 - lastBotIdx;
          currentStreamingBotMessageIdRef.current = next[existingIndex].id;
        }
      }

      if (existingIndex >= 0) {
        next[existingIndex] = {
          ...next[existingIndex],
          content: next[existingIndex].content + token,
          streaming: true,
          citations:
            next[existingIndex].citations ||
            (pendingCitationsRef.current.length > 0
              ? pendingCitationsRef.current
              : undefined),
        };
      } else {
        const newMessageId = getId();
        const citations = pendingCitationsRef.current;

        next.push({
          id: newMessageId,
          role: "bot",
          content: token,
          streaming: true,
          timestamp: new Date(),
          citations: citations.length > 0 ? citations : undefined,
        });
        currentStreamingBotMessageIdRef.current = newMessageId;
      }
      return next;
    });
  });

  useRTVIClientEvent(RTVIEvent.BotLlmStopped, () => {
    logEvent("botLlmStopped");
  });

  // 6. Bot TTS Events
  useRTVIClientEvent(RTVIEvent.BotTtsStarted, () => {
    logEvent("botTtsStarted");
    setIsThinking?.(false);
    if (botFinalizeTimerRef.current) {
      clearTimeout(botFinalizeTimerRef.current);
      botFinalizeTimerRef.current = null;
    }
  });

  useRTVIClientEvent(RTVIEvent.BotTtsStopped, () => {
    logEvent("botTtsStopped");
  });

  // 7. Metrics & TTFB Data
  useRTVIClientEvent(RTVIEvent.Metrics, (data: PipecatMetricsData) => {
    let sttVal: number | null = null;
    let ttsVal: number | null = null;
    let llmVal: number | null = null;

    if (data?.ttfb && Array.isArray(data.ttfb)) {
      for (const item of data.ttfb) {
        if (!item || typeof item.value !== "number" || item.value <= 0.001) {
          continue;
        }
        const proc = (item.processor || "").toLowerCase();
        const ms = item.value < 15 ? Math.round(item.value * 10000) / 10 : Math.round(item.value * 10) / 10;
        if (proc.includes("deepgram") || (proc.includes("stt") && !proc.includes("elevenlabs"))) {
          sttVal = ms;
        } else if (proc.includes("elevenlabs") || (proc.includes("tts") && !proc.includes("deepgram"))) {
          ttsVal = ms;
        } else if (proc.includes("groq") || proc.includes("llm")) {
          llmVal = ms;
        }
      }
    }

    if (onNewTurnMetrics && (sttVal !== null || ttsVal !== null || llmVal !== null)) {
      onNewTurnMetrics(sttVal, ttsVal, llmVal);
    }

    if (sttVal !== null || ttsVal !== null || llmVal !== null) {
      logEvent(
        "metrics",
        `TTFB [STT: ${sttVal !== null ? sttVal + "ms" : "-"}, TTS: ${ttsVal !== null ? ttsVal + "ms" : "-"}, LLM: ${llmVal !== null ? llmVal + "ms" : "-"}]`
      );
    }

    if (data?.characters && Array.isArray(data.characters)) {
      const charCount = data.characters.reduce((acc, curr) => acc + (curr.value || 0), 0);
      if (charCount > 0) {
        logEvent("ttsUsage", `${charCount} characters synthesized`);
      }
    }

    if (setLiveMetrics) {
      setLiveMetrics((prev) => ({
        processing: [...(prev?.processing || []), ...(data.processing || [])],
        ttfb: [...(prev?.ttfb || []), ...(data.ttfb || [])],
        characters: [...(prev?.characters || []), ...(data.characters || [])],
      }));
    }

    setMessages((prev) => {
      const next = [...prev];
      let targetIndex = -1;
      if (currentStreamingBotMessageIdRef.current) {
        targetIndex = next.findIndex((m) => m.id === currentStreamingBotMessageIdRef.current);
      }
      if (targetIndex < 0) {
        const lastBotIdx = next.slice().reverse().findIndex((m) => m.role === "bot");
        if (lastBotIdx >= 0) {
          targetIndex = next.length - 1 - lastBotIdx;
        }
      }

      if (targetIndex >= 0) {
        const existingMetrics = next[targetIndex].metrics;
        next[targetIndex] = {
          ...next[targetIndex],
          metrics: {
            processing: [...(existingMetrics?.processing || []), ...(data.processing || [])],
            ttfb: [...(existingMetrics?.ttfb || []), ...(data.ttfb || [])],
            characters: [...(existingMetrics?.characters || []), ...(data.characters || [])],
          },
        };
      }
      return next;
    });
  });
}
