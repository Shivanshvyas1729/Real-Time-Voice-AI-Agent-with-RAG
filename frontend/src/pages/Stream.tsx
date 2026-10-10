import { PipecatClient } from "@pipecat-ai/client-js";
import {
  PipecatClientProvider,
  PipecatClientAudio,
} from "@pipecat-ai/client-react";
import { WebSocketTransport } from "@pipecat-ai/websocket-transport";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { useState, useEffect, useMemo } from "react";
import RealTimeChatPanel from "@/components/RealTimeChatPanel";

const Stream = () => {
  const [equipmentId, setEquipmentId] = useState<string | undefined>(undefined);
  const [transportType, setTransportType] = useState<"webrtc" | "websocket">("webrtc");

  const client = useMemo(() => {
    try {
      const transport =
        transportType === "webrtc"
          ? new SmallWebRTCTransport()
          : new WebSocketTransport();
      Object.defineProperty(transport, "isCamEnabled", { get: () => false, configurable: true });
      Object.defineProperty(transport, "isSharingScreen", { get: () => false, configurable: true });
      return new PipecatClient({ transport, enableMic: true, enableCam: false });
    } catch (error) {
      console.error("Error initializing PipecatClient:", error);
      const transport = new SmallWebRTCTransport();
      Object.defineProperty(transport, "isCamEnabled", { get: () => false, configurable: true });
      Object.defineProperty(transport, "isSharingScreen", { get: () => false, configurable: true });
      return new PipecatClient({ transport, enableMic: true, enableCam: false });
    }
  }, [transportType]);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (
        event.reason?.message?.includes?.("enumerateDevices") ||
        event.reason?.toString?.()?.includes?.("enumerateDevices") ||
        event.reason?.stack?.includes?.("enumerateDevices")
      ) {
        console.warn("Microphone access notice:", event.reason);
        event.preventDefault();
        return;
      }
      console.error("Unhandled promise rejection:", event.reason);
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    return () => {
      client?.disconnect();
    };
  }, [client]);

  return (
    <PipecatClientProvider client={client}>
      {/* Native WebRTC Hardware Audio Output Element */}
      <PipecatClientAudio />
      <div className="h-screen w-screen bg-white dark:bg-[#0b0f19] overflow-hidden">
        <RealTimeChatPanel
          equipmentId={equipmentId}
          onEquipmentChange={setEquipmentId}
          transportType={transportType}
          onTransportChange={setTransportType}
        />
      </div>
    </PipecatClientProvider>
  );
};

export default Stream;
