import { Socket } from "socket.io-client";
import { validateRoomSettings, ROOM_CONSTRAINTS } from "../config/roomConstraints";

export interface RoomCreateOptions {
  maxPlayers: number;
  rounds: number;
  roundTime: number;
  username: string;
}

export interface RoomCreatedResult {
  success: boolean;
  roomCode?: string;
  error?: string;
}

/**
 * Create (assign) a room via socket event.
 * Validates settings against constraints before sending.
 */
export async function createRoom(
  socket: Socket | null,
  options: Partial<RoomCreateOptions>
): Promise<RoomCreatedResult> {
  if (!socket) return { success: false, error: "Socket not connected" };

  const settings: RoomCreateOptions = {
    maxPlayers: options.maxPlayers ?? ROOM_CONSTRAINTS.maxPlayers.default,
    rounds:     options.rounds     ?? ROOM_CONSTRAINTS.rounds.default,
    roundTime:  options.roundTime  ?? ROOM_CONSTRAINTS.roundTime.default,
    username:   String(options.username ?? "").trim() || "Host",
  };

  const validation = validateRoomSettings(settings);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(", ") };
  }

  return new Promise((resolve) => {
    socket.emit("createRoom", settings, (result: RoomCreatedResult) => {
      resolve(result);
    });
  });
}

/**
 * Listen for roomCreated event (server confirms room code).
 * Returns cleanup function.
 */
export function onRoomCreated(
  socket: Socket | null,
  callback: (roomCode: string) => void
): () => void {
  if (!socket) return () => {};
  const handler = ({ roomCode }: { roomCode: string }) => callback(roomCode);
  socket.on("roomCreated", handler);
  return () => socket.off("roomCreated", handler);
}
