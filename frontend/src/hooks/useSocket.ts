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
      // Start with polling so Render can establish the session first,
      // then upgrade to WebSocket. This avoids the "WS closed before
      // connection established" error caused by Render's proxy behavior.
      transports: ["polling", "websocket"],
      upgrade: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      // Must be > Render's 30s idle timeout to prevent unnecessary drops
      timeout: 20000,
      // Auth payload sent on every connect/reconnect so the server can
      // restore session state when the same userId reconnects
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

    newSocket.on("disconnect", (reason) => {
      console.log("✗ Disconnected:", reason);
      setIsReady(false);
      // If the server closed the connection (not a client-side issue),
      // socket.io will automatically reconnect. We just need to wait.
    });

    // When a reconnect succeeds the socket may have recovered its previous
    // state (if connectionStateRecovery is enabled on the server). The
    // `recovered` flag on the socket indicates whether the session was
    // fully restored; if not, the app-level join logic will re-run.
    newSocket.on("connect", () => {
      setIsReady(true);
    });

    return () => {
      // Keep socket alive across route changes
    };
  }, []);

  return isReady ? socketRef.current : null;
}