import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

let globalSocket: Socket | null = null;

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // If socket already exists, mark as ready
    if (globalSocket) {
      socketRef.current = globalSocket;
      setIsReady(true);
      return;
    }

    const backendUrl =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
    console.log("Connecting to backend:", backendUrl);
    
    const newSocket = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    socketRef.current = newSocket;
    globalSocket = newSocket;

    newSocket.on("connect", () => {
      console.log("✓ Connected to server:", newSocket.id);
      setIsReady(true);
    });

    newSocket.on("connect_error", (error) => {
      console.error("✗ Connection error:", error);
      setIsReady(false);
    });

    newSocket.on("disconnect", () => {
      console.log("✗ Disconnected from server");
      setIsReady(false);
    });

    return () => {
      // Don't disconnect socket on unmount - keep it alive
    };
  }, []);

  // Return socket only when ready, null otherwise
  return isReady ? socketRef.current : null;
}

