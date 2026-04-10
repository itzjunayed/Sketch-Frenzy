import { Socket } from "socket.io-client";

export interface JoinRoomResult {
  success: boolean;
  room?: any;
  error?: string;
}

/** Join a room by code */
export async function joinRoomByCode(
  socket: Socket | null,
  roomCode: string,
  username: string
): Promise<JoinRoomResult> {
  if (!socket) return { success: false, error: "Socket not connected" };

  return new Promise((resolve) => {
    socket.emit("joinRoomByCode", { roomCode, username }, (result: JoinRoomResult) => {
      resolve(result);
    });
  });
}

/** Leave the current room */
export function leaveRoom(socket: Socket | null): void {
  if (socket) socket.emit("leaveRoom");
}

export function onPlayerJoined(
  socket: Socket | null,
  callback: (data: { username: string; players: any[]; hostId: string }) => void
): () => void {
  if (!socket) return () => {};
  socket.on("playerJoined", callback);
  return () => socket.off("playerJoined", callback);
}

export function onPlayerLeft(
  socket: Socket | null,
  callback: (data: { players: any[]; hostId: string }) => void
): () => void {
  if (!socket) return () => {};
  socket.on("playerLeft", callback);
  return () => socket.off("playerLeft", callback);
}

export function onHostTransferred(
  socket: Socket | null,
  callback: (data: { newHostId: string }) => void
): () => void {
  if (!socket) return () => {};
  socket.on("hostTransferred", callback);
  return () => socket.off("hostTransferred", callback);
}

export function onKicked(
  socket: Socket | null,
  callback: (data: { reason: string; redirectTo: string }) => void
): () => void {
  if (!socket) return () => {};
  socket.on("kicked", callback);
  return () => socket.off("kicked", callback);
}

export function onRoomUpdated(
  socket: Socket | null,
  callback: () => void
): () => void {
  if (!socket) return () => {};
  socket.on("roomUpdated", callback);
  return () => socket.off("roomUpdated", callback);
}
