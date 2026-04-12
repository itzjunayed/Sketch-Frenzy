import { createClient, RedisClientType } from "redis";

export const MAX_USERNAME_LENGTH = 8;

export interface RoomPlayer {
  socketId: string;
  username: string;
  joinedAt: number;
  lastActivityAt: number;
}

export interface RoomModel {
  code: string;
  createdAt: number;
  maxPlayers: number;
  rounds: number;
  roundTime: number;
  players: RoomPlayer[];
  playersOrder: string[];
  status: "available" | "active" | "ended";
  host?: string;
  hostIP?: string;
  assignedAt?: number;
}

export interface RoomCreateOptions {
  maxPlayers: number;
  rounds: number;
  roundTime: number;
  username: string;
}

export type RoomIdleCheckCallback = (
  roomCode: string,
  removedSocketIds: string[],
  newHostId?: string
) => void;

// ── Configuration constants ────────────────────────────────────────────────────

// 60 minutes: only truly abandoned connections should be removed.
// The lobby (waiting phase) must never auto-kick players who are just
// sitting and waiting for others to join.  During an active round the
// activity tracker already keeps lastActivityAt fresh, so a 60-minute
// window is effectively "off" for real players without disrupting the
// Redis clean-up of genuinely ghost sockets.
const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

const TARGET_AVAILABLE_ROOMS = 25;
const AUTO_CREATE_COUNT = 25;

const ROOM_KEY_PREFIX = "room:";
const AVAILABLE_ROOMS_KEY = "available_rooms";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisClient: RedisClientType | null = null;

function roomKey(code: string): string {
  return `${ROOM_KEY_PREFIX}${code}`;
}

function generateRoomCode(length = 8): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  while (code.length < length) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

async function client(): Promise<RedisClientType> {
  if (redisClient && redisClient.isOpen) return redisClient;
  redisClient = createClient({ url: REDIS_URL }) as RedisClientType;
  redisClient.on("error", (error) => { console.error("Redis Client Error:", error); });
  await redisClient.connect();
  return redisClient;
}

export function getRedisClient(): RedisClientType | null {
  return redisClient;
}

export async function connectRedis(): Promise<void> {
  await client();
  console.log("✓ Redis connected");
}

// ── Room pool management ───────────────────────────────────────────────────────

export async function preCreateRooms(count: number = 100): Promise<void> {
  const redis = await client();
  const generatedCodes = new Set<string>();
  const roomsToCreate: RoomModel[] = [];

  while (generatedCodes.size < count) {
    const code = generateRoomCode();
    if (!generatedCodes.has(code)) {
      generatedCodes.add(code);
      roomsToCreate.push({
        code, createdAt: Date.now(), maxPlayers: 0, rounds: 0,
        roundTime: 0, players: [], playersOrder: [], status: "available",
      });
    }
  }

  for (const room of roomsToCreate) {
    await redis.set(roomKey(room.code), JSON.stringify(room));
    await redis.rPush(AVAILABLE_ROOMS_KEY, room.code);
  }

  console.log(`✓ Pre-created ${count} available rooms`);
}

export async function getAvailableRoomsCount(): Promise<number> {
  const redis = await client();
  return await redis.lLen(AVAILABLE_ROOMS_KEY);
}

export async function autoCreateRoomsIfNeeded(): Promise<boolean> {
  const availableCount = await getAvailableRoomsCount();
  if (availableCount < TARGET_AVAILABLE_ROOMS) {
    const needed = Math.max(TARGET_AVAILABLE_ROOMS - availableCount, AUTO_CREATE_COUNT);
    console.log(`⚠ Available rooms at ${availableCount}, creating ${needed} more...`);
    await preCreateRooms(needed);
    return true;
  }
  return false;
}

export async function cleanupExcessRooms(): Promise<boolean> {
  const redis = await client();
  const availableCount = await getAvailableRoomsCount();
  if (availableCount > TARGET_AVAILABLE_ROOMS) {
    const toDelete = availableCount - TARGET_AVAILABLE_ROOMS;
    console.log(`🧹 Cleaning up ${toDelete} excess rooms...`);
    for (let i = 0; i < toDelete; i++) {
      const code = await redis.lPop(AVAILABLE_ROOMS_KEY);
      if (code) await redis.del(roomKey(code));
    }
    return true;
  }
  return false;
}

export async function assignRoom(
  hostId: string, hostIP: string, options: RoomCreateOptions
): Promise<RoomModel | null> {
  const redis = await client();
  await autoCreateRoomsIfNeeded();

  const roomCode = await redis.lPop(AVAILABLE_ROOMS_KEY);
  if (!roomCode) { console.error("No available rooms"); return null; }

  const room = await getRoom(roomCode);
  if (!room || room.status !== "available") { console.error(`Room ${roomCode} unavailable`); return null; }

  room.status = "active";
  room.host = hostId;
  room.hostIP = hostIP;
  room.assignedAt = Date.now();
  room.maxPlayers = options.maxPlayers;
  room.rounds = options.rounds;
  room.roundTime = options.roundTime;

  await saveRoom(room);
  console.log(`Room assigned: ${room.code} (host: ${hostId})`);
  return room;
}

export async function unassignEmptyRoom(roomCode: string): Promise<RoomModel | null> {
  const room = await getRoom(roomCode);
  if (!room || room.players.length > 0) return room ?? null;

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

  console.log(`♻  Room ${roomCode} returned to available pool`);
  await cleanupExcessRooms();
  return room;
}

export async function getRoom(code: string): Promise<RoomModel | null> {
  const redis = await client();
  const raw = await redis.get(roomKey(code));
  if (!raw) return null;
  return JSON.parse(raw) as RoomModel;
}

export async function saveRoom(room: RoomModel): Promise<void> {
  const redis = await client();
  await redis.set(roomKey(room.code), JSON.stringify(room));
}

export async function deleteRoom(code: string): Promise<void> {
  const redis = await client();
  await redis.del(roomKey(code));
}

// ── Player management ──────────────────────────────────────────────────────────

export async function addPlayerToRoom(
  roomCode: string, socketId: string, username: string
): Promise<RoomModel | null> {
  const room = await getRoom(roomCode);
  if (!room) return null;
  if (room.maxPlayers > 0 && room.players.length >= room.maxPlayers) return null;

  const now = Date.now();
  const sanitizedUsername = String(username ?? "").trim().slice(0, MAX_USERNAME_LENGTH) || "Guest";

  const existingIndex = room.players.findIndex((p) => p.socketId === socketId);
  if (existingIndex >= 0) {
    room.players[existingIndex].lastActivityAt = now;
  } else {
    room.players.push({ socketId, username: sanitizedUsername, joinedAt: now, lastActivityAt: now });
    room.playersOrder.push(socketId);
  }

  await saveRoom(room);
  return room;
}

export async function removePlayerFromRoom(
  roomCode: string, socketId: string
): Promise<RoomModel | null> {
  const room = await getRoom(roomCode);
  if (!room) return null;

  room.players = room.players.filter((p) => p.socketId !== socketId);
  room.playersOrder = room.playersOrder.filter((id) => id !== socketId);

  if (room.host === socketId && room.playersOrder.length > 0) {
    room.host = room.playersOrder[0];
    console.log(`Host transferred to ${room.host} in room ${roomCode}`);
  }

  if (room.players.length === 0) {
    await unassignEmptyRoom(roomCode);
    await autoCreateRoomsIfNeeded();
    return room;
  }

  await saveRoom(room);
  return room;
}

export async function updatePlayerActivity(roomCode: string, socketId: string): Promise<void> {
  const room = await getRoom(roomCode);
  if (!room) return;
  const player = room.players.find((p) => p.socketId === socketId);
  if (player) {
    player.lastActivityAt = Date.now();
    await saveRoom(room);
  }
}

// ── Idle checking ──────────────────────────────────────────────────────────────

export async function checkIdlePlayersInRoom(
  roomCode: string
): Promise<{ idleSockets: string[]; newHostId?: string }> {
  const room = await getRoom(roomCode);
  if (!room || room.status !== "active") return { idleSockets: [] };

  const now = Date.now();
  const idleSockets: string[] = [];
  let hostWasIdle = false;

  for (const player of room.players) {
    if (now - player.lastActivityAt > IDLE_TIMEOUT_MS) {
      idleSockets.push(player.socketId);
      if (player.socketId === room.host) hostWasIdle = true;
    }
  }

  if (idleSockets.length > 0) {
    for (const sid of idleSockets) {
      room.players = room.players.filter((p) => p.socketId !== sid);
      room.playersOrder = room.playersOrder.filter((id) => id !== sid);
    }

    let newHostId: string | undefined;
    if (hostWasIdle && room.playersOrder.length > 0) {
      newHostId = room.playersOrder[0];
      room.host = newHostId;
    }

    if (room.players.length === 0) {
      room.status = "available";
    } else {
      await saveRoom(room);
    }

    return { idleSockets, newHostId };
  }

  return { idleSockets: [] };
}

export function startIdleCheckService(
  interval: number = 30000,
  callback?: RoomIdleCheckCallback
): () => void {
  const timer = setInterval(async () => {
    try {
      const redis = await client();
      const keys = await redis.keys(`${ROOM_KEY_PREFIX}*`);
      for (const key of keys) {
        const code = key.replace(ROOM_KEY_PREFIX, "");
        const result = await checkIdlePlayersInRoom(code);
        if (result.idleSockets.length > 0 && callback) {
          callback(code, result.idleSockets, result.newHostId);
        }
      }
    } catch (err) {
      console.error("Idle check error:", err);
    }
  }, interval);
  return () => clearInterval(timer);
}

export function startCleanupService(interval: number = 60000): () => void {
  const timer = setInterval(async () => {
    try { await cleanupExcessRooms(); }
    catch (err) { console.error("Cleanup service error:", err); }
  }, interval);
  return () => clearInterval(timer);
}