import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

let globalSocket: Socket | null = null;

/** Generate or retrieve a persistent localStorage UUID for this browser */
function getOrCreateUserId(): string {
  const key = "sketchy_user_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/** Simple device fingerprint: hashed combo of UA + timezone + language */
function getFingerprint(): string {
  const raw = [
    navigator.userAgent,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
  ].join("|");
  // Cheap, non-crypto hash (we just need a stable string)
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export function useSocket(): Socket | null {
  const socketRef = useRef<Socket | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (globalSocket) {
      socketRef.current = globalSocket;
      if (globalSocket.connected) setIsReady(true);
      return;
    }

    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
    console.log("Connecting to backend:", backendUrl);

    const newSocket = io(backendUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      auth: {
        userId: getOrCreateUserId(),
        fingerprint: getFingerprint(),
      },
    });

    socketRef.current = newSocket;
    globalSocket = newSocket;

    newSocket.on("connect", () => {
      console.log("✓ Connected:", newSocket.id);
      setIsReady(true);
    });

    newSocket.on("connect_error", (err) => {
      console.error("✗ Connection error:", err.message);
      setIsReady(false);
    });

    newSocket.on("disconnect", () => {
      console.log("✗ Disconnected");
      setIsReady(false);
    });

    return () => {
      // Keep socket alive across route changes
    };
  }, []);

  return isReady ? socketRef.current : null;
}
