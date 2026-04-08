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
 * Create (assign) a room and emit socket event to backend
 * Validates settings against constraints before sending
 * 
 * Note: Backend has 100 pre-created rooms available
 * This function assigns an available room to the user as host
 * with their IP address tracked
 */
export async function createRoom(
  socket: Socket | null,
  options: Partial<RoomCreateOptions>
): Promise<RoomCreatedResult> {
  if (!socket) {
    return { success: false, error: "Socket not connected" };
  }

  // Apply defaults for missing values
  const settings: RoomCreateOptions = {
    maxPlayers: options.maxPlayers ?? ROOM_CONSTRAINTS.maxPlayers.default,
    rounds: options.rounds ?? ROOM_CONSTRAINTS.rounds.default,
    roundTime: options.roundTime ?? ROOM_CONSTRAINTS.roundTime.default,
    username: String(options.username ?? "").trim() || "Host",
  };

  // Validate settings
  const validation = validateRoomSettings(settings);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(", ") };
  }

  return new Promise((resolve) => {
    socket.emit(
      "createRoom",
      settings,
      (result: RoomCreatedResult) => {
        resolve(result);
      }
    );
  });
}

/**
 * Listen for room creation events
 */
export function onRoomCreated(
  socket: Socket | null,
  callback: (roomCode: string) => void
): () => void {
  if (!socket) return () => {};

  socket.on("roomCreated", ({ roomCode }) => {
    callback(roomCode);
  });

  // Return cleanup function
  return () => {
    socket.off("roomCreated");
  };
}
