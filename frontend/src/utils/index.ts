// Config
export { ROOM_CONSTRAINTS, validateRoomSettings } from "./config/roomConstraints";
export type { RoomConstraints } from "./config/roomConstraints";

// Services - Room
export { createRoom, onRoomCreated } from "./services/roomService";
export type { RoomCreateOptions, RoomCreatedResult } from "./services/roomService";

// Services - Player
export {
  joinRoomByCode,
  leaveRoom,
  onPlayerJoined,
  onPlayerLeft,
  onHostTransferred,
  onKicked,
  onRoomUpdated,
} from "./services/playerService";
export type { JoinRoomResult } from "./services/playerService";

// Services - Activity Tracking
export { startActivityTracking, isIdleLocally } from "./services/activityTracker";
