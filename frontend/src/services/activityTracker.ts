import { Socket } from "socket.io-client";

const ACTIVITY_EMIT_INTERVAL = 30000; // Emit activity every 30 seconds

/**
 * Start activity tracking
 * Monitors mouse and keyboard events and periodically sends activity to backend
 * Returns cleanup function
 */
export function startActivityTracking(socket: Socket | null): () => void {
  if (!socket) return () => {};

  let lastActivityTime = Date.now();
  let isActive = false;

  // Handlers for user activity
  const handleActivity = () => {
    lastActivityTime = Date.now();
    isActive = true;
  };

  // Event listeners
  const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
  for (const event of events) {
    document.addEventListener(event, handleActivity);
  }

  // Periodic emission of activity
  const activityInterval = setInterval(() => {
    if (isActive || Date.now() - lastActivityTime < ACTIVITY_EMIT_INTERVAL) {
      socket.emit("activity");
      isActive = false;
    }
  }, ACTIVITY_EMIT_INTERVAL);

  // Return cleanup function
  return () => {
    clearInterval(activityInterval);
    for (const event of events) {
      document.removeEventListener(event, handleActivity);
    }
  };
}

/**
 * Check if user has been idle for duration (in milliseconds)
 * Used client-side for optimistic detection before server confirmation
 */
export function isIdleLocally(lastActivityTime: number, idleDurationMs: number = 2 * 60 * 1000): boolean {
  return Date.now() - lastActivityTime > idleDurationMs;
}
