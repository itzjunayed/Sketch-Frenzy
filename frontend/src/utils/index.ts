// Convenience re-exports used by pages
export { ROOM_CONSTRAINTS, validateRoomSettings } from "../config/roomConstraints";
export type { RoomConstraints } from "../config/roomConstraints";

export { createRoom, onRoomCreated } from "../services/roomService";
export type { RoomCreateOptions, RoomCreatedResult } from "../services/roomService";

export { joinRoomByCode, leaveRoom } from "../services/playerService";
export type { JoinRoomResult } from "../services/playerService";

export { startActivityTracking, isIdleLocally } from "../services/activityTracker";
