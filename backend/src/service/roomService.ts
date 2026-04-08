import { createClient, RedisClientType } from "redis";

export const MAX_USERNAME_LENGTH = 8;

export interface RoomPlayer {
  socketId: string;
  username: string;  // Max 8 characters
  joinedAt: number;
  lastActivityAt: number;
}

export interface RoomModel {
  code: string;
  createdAt: number;
  maxPlayers: number;
  rounds: number;
  roundTime: number;
  players: RoomPlayer[];      // Array of players in this room
  playersOrder: string[];     // Order of socket IDs by join time (for host transfer)
  status: "available" | "active" | "ended";
  host?: string;              // Socket ID of room host
  hostIP?: string;            // IP address of room host
  assignedAt?: number;        // Timestamp when room was assigned to host
}

export interface RoomCreateOptions {
  maxPlayers: number;
  rounds: number;
  roundTime: number;
  username: string;
}

export type RoomIdleCheckCallback = (roomCode: string, removedSocketIds: string[], newHostId?: string) => void;

const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const ROOMS_TO_CREATE_THRESHOLD = 50; // Auto-create when available rooms <= this
const AUTO_CREATE_COUNT = 100; // How many rooms to create

const ROOM_KEY_PREFIX = "room:";
const AVAILABLE_ROOMS_KEY = "available_rooms";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
let redisClient: RedisClientType | null = null;

function roomKey(code: string) {
  return `${ROOM_KEY_PREFIX}${code}`;
}

function generateRoomCode(length = 8) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  while (code.length < length) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

async function client() {
  if (redisClient && redisClient.isOpen) return redisClient;
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on("error", (error) => {
    console.error("Redis Client Error:", error);
  });
  await redisClient.connect();
  return redisClient;
}

export async function connectRedis(): Promise<void> {
  await client();
}

/**
 * Pre-create 100 available rooms on server startup
 */
export async function preCreateRooms(count: number = 100): Promise<void> {
  const redis = await client();
  const generatedCodes = new Set<string>();
  const roomsToCreate: RoomModel[] = [];

  // Generate unique codes
  while (generatedCodes.size < count) {
    const code = generateRoomCode();
    if (!generatedCodes.has(code)) {
      generatedCodes.add(code);

      const room: RoomModel = {
        code,
        createdAt: Date.now(),
        maxPlayers: 0, // Will be set when assigned
        rounds: 0,
        roundTime: 0,
        players: [],
        playersOrder: [],
        status: "available",
      };
      roomsToCreate.push(room);
    }
  }

  // Store rooms in Redis
  for (const room of roomsToCreate) {
    const key = roomKey(room.code);
    await redis.set(key, JSON.stringify(room));
    await redis.rPush(AVAILABLE_ROOMS_KEY, room.code);
  }

  console.log(`✓ Pre-created ${count} available rooms`);
}

/**
 * Assign an available room to a user as host
 */
export async function assignRoom(
  hostId: string,
  hostIP: string,
  options: RoomCreateOptions
): Promise<RoomModel | null> {
  const redis = await client();

  // Get next available room code
  const roomCode = await redis.lPop(AVAILABLE_ROOMS_KEY);
  if (!roomCode) {
    console.error("No available rooms");
    return null;
  }

  // Get and update the room
  const room = await getRoom(roomCode);
  if (!room) {
    console.error(`Room ${roomCode} not found`);
    return null;
  }

  room.status = "active";
  room.host = hostId;
  room.hostIP = hostIP;
  room.assignedAt = Date.now();
  room.maxPlayers = options.maxPlayers;
  room.rounds = options.rounds;
  room.roundTime = options.roundTime;

  await saveRoom(room);
  return room;
}

/**
 * Get available rooms count (for monitoring)
 */
export async function getAvailableRoomsCount(): Promise<number> {
  const redis = await client();
  return await redis.lLen(AVAILABLE_ROOMS_KEY);
}

/**
 * Auto-create rooms if available count falls below threshold
 */
export async function autoCreateRoomsIfNeeded(): Promise<boolean> {
  const availableCount = await getAvailableRoomsCount();

  if (availableCount <= ROOMS_TO_CREATE_THRESHOLD) {
    const roomsToCreate = AUTO_CREATE_COUNT;
    console.log(`⚠️  Available rooms at ${availableCount}, creating ${roomsToCreate} more...`);
    await preCreateRooms(roomsToCreate);
    const newCount = await getAvailableRoomsCount();
    console.log(`✓ Auto-created rooms. Available now: ${newCount}`);
    return true;
  }

  return false;
}

/**
 * Unassign a room (mark as available) when it becomes empty
 */
export async function unassignEmptyRoom(roomCode: string): Promise<RoomModel | null> {
  const room = await getRoom(roomCode);
  if (!room || room.players.length > 0) {
    return room; // Room has players, don't unassign
  }

  // Reset room to available state
  room.status = "available";
  room.host = undefined;
  room.hostIP = undefined;
  room.assignedAt = undefined;
  room.maxPlayers = 0;
  room.rounds = 0;
  room.roundTime = 0;
  room.players = [];
  room.playersOrder = [];

  const redis = await client();
  await redis.set(roomKey(roomCode), JSON.stringify(room));
  await redis.rPush(AVAILABLE_ROOMS_KEY, roomCode);

  console.log(`♻️  Room ${roomCode} unassigned and returned to available pool`);
  return room;
}

export async function getRoom(code: string): Promise<RoomModel | null> {
  const redis = await client();
  const response = await redis.get(roomKey(code));
  if (!response) return null;
  return JSON.parse(response) as RoomModel;
}

export async function saveRoom(room: RoomModel): Promise<void> {
  const redis = await client();
  await redis.set(roomKey(room.code), JSON.stringify(room));
}

export async function deleteRoom(code: string): Promise<void> {
  const redis = await client();
  await redis.del(roomKey(code));
}

/**
 * Add a player to a room
 */
export async function addPlayerToRoom(
  roomCode: string,
  socketId: string,
  username: string
): Promise<RoomModel | null> {
  const room = await getRoom(roomCode);
  if (!room) return null;

  const now = Date.now();
  // Enforce max 8 character username
  const sanitizedUsername = String(username ?? "").trim().slice(0, MAX_USERNAME_LENGTH) || "Guest";

  // Check if player already exists
  const existingIndex = room.players.findIndex((p) => p.socketId === socketId);

  if (existingIndex >= 0) {
    // Update existing player
    room.players[existingIndex].lastActivityAt = now;
  } else {
    // Add new player
    room.players.push({
      socketId,
      username: sanitizedUsername,
      joinedAt: now,
      lastActivityAt: now,
    });
    room.playersOrder.push(socketId);
  }

  await saveRoom(room);
  return room;
}

/**
 * Remove a player from a room
 */
export async function removePlayerFromRoom(
  roomCode: string,
  socketId: string
): Promise<RoomModel | null> {
  const room = await getRoom(roomCode);
  if (!room) return null;

  room.players = room.players.filter((p) => p.socketId !== socketId);
  room.playersOrder = room.playersOrder.filter((id) => id !== socketId);

  // If host leaves, transfer to next player in line
  if (room.host === socketId && room.playersOrder.length > 0) {
    room.host = room.playersOrder[0];
  }

  // If no more players, unassign the room (mark as available and return to queue)
  if (room.players.length === 0) {
    await unassignEmptyRoom(roomCode);
    // Auto-create rooms if needed
    await autoCreateRoomsIfNeeded();
    return room;
  }

  await saveRoom(room);
  return room;
}

/**
 * Update player activity timestamp
 */
export async function updatePlayerActivity(
  roomCode: string,
  socketId: string
): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room) return;

  const player = room.players.find((p) => p.socketId === socketId);
  if (player) {
    player.lastActivityAt = Date.now();
    await saveRoom(room);
  }
}

/**
 * Check for idle players and handle transfers
 * Returns list of socket IDs that need to be kicked and optional new host ID
 */
export async function checkIdlePlayersInRoom(
  roomCode: string
): Promise<{ idleSockets: string[]; newHostId?: string }> {
  const room = await getRoom(roomCode);
  if (!room) return { idleSockets: [] };

  const now = Date.now();
  const idleSockets: string[] = [];
  let hostWasIdle = false;

  // Find idle players
  for (const player of room.players) {
    if (now - player.lastActivityAt > IDLE_TIMEOUT_MS) {
      idleSockets.push(player.socketId);
      if (player.socketId === room.host) {
        hostWasIdle = true;
      }
    }
  }

  // Remove idle players
  if (idleSockets.length > 0) {
    for (const socketId of idleSockets) {
      room.players = room.players.filter((p) => p.socketId !== socketId);
      room.playersOrder = room.playersOrder.filter((id) => id !== socketId);
    }

    let newHostId: string | undefined;
    // If host was idle, transfer to first remaining player (in join order)
    if (hostWasIdle && room.playersOrder.length > 0) {
      newHostId = room.playersOrder[0];
      room.host = newHostId;
    }

    // If no more players, mark as available
    if (room.players.length === 0) {
      room.status = "available";
    } else {
      await saveRoom(room);
    }

    return { idleSockets, newHostId };
  }

  return { idleSockets: [] };
}

/**
 * Start idle checking service
 * Checks all active rooms periodically for idle players
 */
export function startIdleCheckService(interval: number = 30000, callback?: RoomIdleCheckCallback): () => void {
  const checkInterval = setInterval(async () => {
    try {
      const redis = await client();
      const keys = await redis.keys(`${ROOM_KEY_PREFIX}*`);

      for (const key of keys) {
        const roomCode = key.replace(ROOM_KEY_PREFIX, "");
        const result = await checkIdlePlayersInRoom(roomCode);

        if (result.idleSockets.length > 0 && callback) {
          callback(roomCode, result.idleSockets, result.newHostId);
        }
      }
    } catch (error) {
      console.error("Idle check service error:", error);
    }
  }, interval);

  // Return cleanup function
  return () => clearInterval(checkInterval);
}
