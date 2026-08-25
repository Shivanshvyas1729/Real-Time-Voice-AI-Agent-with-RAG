import { PipecatClient } from '@pipecat-ai/client-js';
import { PipecatClientProvider, usePipecatClientTransportState } from '@pipecat-ai/client-react';
import { WebSocketTransport } from '@pipecat-ai/websocket-transport';
import { useState, useEffect } from 'react';
import RealTimeChatPanel from '@/components/RealTimeChatPanel';
import { TransportStateEnum } from "@pipecat-ai/client-js";

const Stream = () => {
  const [equipmentId, setEquipmentId] = useState<string | undefined>(undefined);
  const transportState = usePipecatClientTransportState();
  const [client] = useState(() => {
    try {
      const transport = new WebSocketTransport();
      // enableMic: false means mic is disabled by default, user can enable via toggle
      return new PipecatClient({ transport, enableMic: false });
    } catch (error) {
      console.error("Error initializing PipecatClient:", error);
      // Return a minimal client even if initialization fails partially
      const transport = new WebSocketTransport();
      return new PipecatClient({ transport, enableMic: false });
    }
  });

  // Log transport state changes at the Stream level
  useEffect(() => {
    console.log("[Stream] Transport state:", transportState);
  }, [transportState]);

  // Global error handler for unhandled promise rejections (like enumerateDevices)
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Suppress enumerateDevices errors - they're expected when not using HTTPS or microphone not available
      if (event.reason?.message?.includes?.('enumerateDevices') ||
        event.reason?.toString?.()?.includes?.('enumerateDevices') ||
        event.reason?.stack?.includes?.('enumerateDevices')) {
        console.warn("⚠️ Microphone access error (expected if not using HTTPS):", event.reason);
        event.preventDefault(); // Prevent error from showing in console
        return;
      }
      // Log other unhandled rejections
      console.error("Unhandled promise rejection:", event.reason);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (transportState === TransportStateEnum.CONNECTED) {
        client?.disconnect();
      }
    };
  }, [client, transportState]);

  return (
    <PipecatClientProvider client={client}>
      <div className="h-full w-full bg-white">
        <RealTimeChatPanel
          equipmentId={equipmentId}
          onEquipmentChange={setEquipmentId}
        />
      </div>
    </PipecatClientProvider>
  );
};

export default Stream;

