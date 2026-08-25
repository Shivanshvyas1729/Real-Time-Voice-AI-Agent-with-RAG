import { useRef } from "react";
import { ChatMessage } from "@/types/ChatMessage";
import { ChunkMetadata } from "@/types/Chunk";
import { ServerMessage } from "@/types/ServerMessage";
import { getTextFromPayload, getId } from "@/utils/chat";
import { BotLLMTextData, PipecatMetricsData, RTVIEvent, TranscriptData } from "@pipecat-ai/client-js";
import { useRTVIClientEvent } from "@pipecat-ai/client-react";

export default function usePipecatChatEvents(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setChunksMetadata: React.Dispatch<React.SetStateAction<{ [key: string]: ChunkMetadata }>>,
) {
  const currentStreamingBotMessageIdRef = useRef<string | null>(null);
  const pendingCitationsRef = useRef<ChunkMetadata[]>([]);

  // Bot LLM started
  useRTVIClientEvent(RTVIEvent.BotLlmStarted, () => {
    console.log("BotLlmStarted");
    setMessages((prev) => {
      const next = [...prev];
      const lastBotMsgIndex = next
        .slice()
        .reverse()
        .findIndex((m) => m.role === "bot");
      const actualIndex = lastBotMsgIndex >= 0 ? next.length - 1 - lastBotMsgIndex : -1;

      if (actualIndex >= 0 && next[actualIndex].streaming) {
        currentStreamingBotMessageIdRef.current = next[actualIndex].id;
      } else {
        currentStreamingBotMessageIdRef.current = null;
      }

      return next;
    });
  });

  // Update ServerMessage handler:
  useRTVIClientEvent(RTVIEvent.ServerMessage, (data: ServerMessage) => {
    if (data.type === "search_knowledge_base") {
      const newChunks = data.chunks?.map(c => c.metadata) || [];
      // Add to global metadata map
      setChunksMetadata((prev) => ({
        ...prev,
        ...data.chunks?.reduce((acc, chunk) => {
          acc[chunk.metadata.chunk_id] = chunk.metadata;
          return acc;
        }, {} as { [key: string]: ChunkMetadata }) || {},
      }));
      // Store as pending for the upcoming bot response
      pendingCitationsRef.current = newChunks;
    }
  });

  // User transcript events
  useRTVIClientEvent(RTVIEvent.UserTranscript, (data: TranscriptData) => {
    const content = getTextFromPayload(data).trim();
    const isFinal = !!data?.final;
    const userId = data?.user_id;
    if (!content) return;

    setMessages((prev) => {
      const next = [...prev];

      const streamingMsgIndex = next
        .slice()
        .reverse()
        .findIndex((m) => m.role === "user" && m.user_id === userId && m.streaming);
      const streamingIndex = streamingMsgIndex >= 0 ? next.length - 1 - streamingMsgIndex : -1;

      if (streamingIndex >= 0) {
        next[streamingIndex] = {
          ...next[streamingIndex],
          content,
          streaming: !isFinal,
          timestamp: !isFinal ? next[streamingIndex].timestamp : new Date(),
          user_id: userId || next[streamingIndex].user_id,
        };
        return next;
      }

      const now = Date.now();
      const recentMsgIndex = next
        .slice()
        .reverse()
        .findIndex((m) => {
          if (m.role !== "user" || m.user_id) return false;

          const msgTime = typeof m.timestamp === "string"
            ? new Date(m.timestamp).getTime()
            : m.timestamp?.getTime() || 0;
          const timeDiff = now - msgTime;
          if (timeDiff > 5000) return false;

          const msgContent = m.content.trim().toLowerCase();
          const transcriptContent = content.toLowerCase();
          return msgContent === transcriptContent ||
            transcriptContent.includes(msgContent) ||
            msgContent.includes(transcriptContent);
        });
      const recentIndex = recentMsgIndex >= 0 ? next.length - 1 - recentMsgIndex : -1;

      if (recentIndex >= 0) {
        next[recentIndex] = {
          ...next[recentIndex],
          content,
          streaming: !isFinal,
          timestamp: next[recentIndex].timestamp || new Date(),
          user_id: userId,
        };
        return next;
      }

      next.push({
        id: getId(),
        role: "user",
        content,
        streaming: !isFinal,
        timestamp: new Date(),
        user_id: userId,
      });
      return next;
    });
  });

  // Bot LLM started
  useRTVIClientEvent(RTVIEvent.BotLlmStarted, () => {
    console.log("BotLlmStarted");
    setMessages((prev) => {
      const next = [...prev];
      const lastBotMsgIndex = next
        .slice()
        .reverse()
        .findIndex((m) => m.role === "bot");
      const actualIndex = lastBotMsgIndex >= 0 ? next.length - 1 - lastBotMsgIndex : -1;

      if (actualIndex >= 0 && next[actualIndex].streaming) {
        currentStreamingBotMessageIdRef.current = next[actualIndex].id;
      } else {
        currentStreamingBotMessageIdRef.current = null;
      }

      return next;
    });
  });

  // Bot LLM text tokens
  useRTVIClientEvent(RTVIEvent.BotLlmText, (data: BotLLMTextData) => {
    const token = getTextFromPayload(data);
    if (!token) return;

    setMessages((prev) => {
      const next = [...prev];
      const lastBotMsgIndex = next
        .slice()
        .reverse()
        .findIndex((m) => m.role === "bot");
      const actualIndex = lastBotMsgIndex >= 0 ? next.length - 1 - lastBotMsgIndex : -1;

      if (actualIndex >= 0 && next[actualIndex].streaming) {
        next[actualIndex] = {
          ...next[actualIndex],
          content: next[actualIndex].content + token,
        };
        if (!currentStreamingBotMessageIdRef.current) {
          currentStreamingBotMessageIdRef.current = next[actualIndex].id;
        }
      } else {
        const newMessageId = getId();
        const citations = pendingCitationsRef.current;
        // Do NOT clear pendingCitationsRef here to avoid Strict Mode side-effect issues.
        // It will be cleared in BotLlmStopped.

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

  // Bot LLM stopped
  useRTVIClientEvent(RTVIEvent.BotLlmStopped, () => {
    console.log("BotLlmEnded");
    setMessages((prev) => {
      const next = [...prev];
      const lastBotMsgIndex = next
        .slice()
        .reverse()
        .findIndex((m) => m.role === "bot");
      const actualIndex = lastBotMsgIndex >= 0 ? next.length - 1 - lastBotMsgIndex : -1;

      if (actualIndex >= 0 && next[actualIndex].streaming) {
        next[actualIndex] = {
          ...next[actualIndex],
          streaming: false,
          timestamp: next[actualIndex].timestamp || new Date(),
        };
      }
      currentStreamingBotMessageIdRef.current = null;
      pendingCitationsRef.current = []; // Clear citations after message is done
      return next;
    });
  });

  // Server messages (RAG results)
  useRTVIClientEvent(RTVIEvent.ServerMessage, (data: ServerMessage) => {
    if (data.type === "search_knowledge_base") {
      setChunksMetadata((prev) => ({
        ...prev,
        ...data.chunks?.reduce((acc, chunk) => {
          acc[chunk.metadata.chunk_id] = chunk.metadata;
          return acc;
        }, {} as { [key: string]: ChunkMetadata }) || {},
      }));
    }
  });

  // Metrics
  useRTVIClientEvent(RTVIEvent.Metrics, (data: PipecatMetricsData) => {
    const currentMessageId = currentStreamingBotMessageIdRef.current;

    if (!currentMessageId) return;

    setMessages((prev) => {
      const next = [...prev];
      const messageIndex = next.findIndex((m) => m.id === currentMessageId);

      if (messageIndex >= 0) {
        const existingMetrics = next[messageIndex].metrics;
        const mergedMetrics: PipecatMetricsData = {
          processing: [
            ...(existingMetrics?.processing || []),
            ...(data.processing || []),
          ],
          ttfb: [
            ...(existingMetrics?.ttfb || []),
            ...(data.ttfb || []),
          ],
          characters: [
            ...(existingMetrics?.characters || []),
            ...(data.characters || []),
          ],
        };

        next[messageIndex] = {
          ...next[messageIndex],
          metrics: mergedMetrics,
        };
      }

      return next;
    });
  });
}

