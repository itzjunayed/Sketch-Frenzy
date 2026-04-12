import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from 'dotenv';
dotenv.config();

import { GAME_CONFIG } from "./config/gameConfig";
import {
  connectRedis,
  assignRoom,
  getRoom,
  saveRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  preCreateRooms,
  autoCreateRoomsIfNeeded,
  getAvailableRoomsCount,
  startIdleCheckService,
  startCleanupService,
  getRedisClient,
} from "./services/roomService";
import { GameService } from "./services/gameService";
import { connectDB, upsertUser } from "./db/postgres";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL || "*", methods: ["GET", "POST"] },
});

const strokeBuffers = new Map<string, any[]>();
const gameServices  = new Map<string, GameService>();
const socketToRoom  = new Map<string, string>();
const socketToName  = new Map<string, string>();
const socketToUID   = new Map<string, string>();

function sockKey(roomCode: string, userId: string): string {
  return `sock:${roomCode}:${userId}`;
}

async function redisSet(key: string, value: string, exSec: number = 86400): Promise<void> {
  const r = getRedisClient();
  if (r) await r.set(key, value, { EX: exSec });
}

async function redisGet(key: string): Promise<string | null> {
  const r = getRedisClient();
  return r ? await r.get(key) : null;
}

async function redisDel(key: string): Promise<void> {
  const r = getRedisClient();
  if (r) await r.del(key);
}

async function buildPlayerList(roomCode: string) {
  const room = await getRoom(roomCode);
  if (!room) return [];
  const gs = gameServices.get(roomCode);
  return room.players.map((p) => ({
    id: p.socketId,
    username: p.username,
    score: gs?.getScore(p.socketId) ?? 0,
    hasGuessed: gs?.hasGuessed(p.socketId) ?? false,
    isDrawing: gs?.isCurrentDrawer(p.socketId) ?? false,
  }));
}

async function broadcastPlayerList(roomCode: string): Promise<void> {
  const players = await buildPlayerList(roomCode);
  const room = await getRoom(roomCode);
  io.to(roomCode).emit("playerList", {
    players,
    maxPlayers: room?.maxPlayers ?? 8,
  });
}

async function checkAndRegisterSocket(
  roomCode: string,
  socketId: string,
  userId: string | undefined,
  newSocket: Socket
): Promise<boolean> {
  if (!userId) return true;

  const existing = await redisGet(sockKey(roomCode, userId));
  if (existing && existing !== socketId) {
    const oldSock = io.sockets.sockets.get(existing);
    if (oldSock?.connected) {
      return false;
    }
  }
  await redisSet(sockKey(roomCode, userId), socketId);
  return true;
}

io.on("connection", async (socket: Socket) => {
  const userId      = socket.handshake.auth?.userId as string | undefined;
  const fingerprint = socket.handshake.auth?.fingerprint as string | undefined;
  const ip          = (socket.handshake.headers["x-forwarded-for"] as string | undefined)
    ?.split(",")[0]?.trim() ?? socket.handshake.address;

  if (userId) socketToUID.set(socket.id, userId);

  connectDB().then(async (db) => {
    if (db && userId) {
      await upsertUser(db, userId, fingerprint ?? "", ip).catch(() => {});
    }
  });

  console.log(`[+] ${socket.id} connected (userId=${userId ?? "anon"})`);

  socket.on("createRoom", async (opts: any, callback: (r: any) => void) => {
    try {
      const { maxPlayers, rounds, roundTime, username } = opts ?? {};
      const name = String(username ?? "").trim().slice(0, 8) || "Host";

      const room = await assignRoom(socket.id, ip, {
        maxPlayers: Number(maxPlayers) || 8,
        rounds:     Number(rounds)     || GAME_CONFIG.MAX_ROUNDS,
        roundTime:  Number(roundTime)  || GAME_CONFIG.ROUND_TIME,
        username:   name,
      });

      if (!room) return callback({ success: false, error: "No rooms available. Try again." });

      const allowed = await checkAndRegisterSocket(room.code, socket.id, userId, socket);
      if (!allowed) return callback({ success: false, error: "Already in a room in another tab." });

      await addPlayerToRoom(room.code, socket.id, name);
      socket.join(room.code);
      socketToRoom.set(socket.id, room.code);
      socketToName.set(socket.id, name);

      strokeBuffers.set(room.code, []);
      const gs = new GameService(room.code, io, strokeBuffers);
      gs.setConfig(room.rounds, room.roundTime, room.maxPlayers);
      gameServices.set(room.code, gs);

      const players = await buildPlayerList(room.code);

      socket.emit("roomCreated", { roomCode: room.code, hostId: socket.id });
      io.to(room.code).emit("playerList",   { players, maxPlayers: room.maxPlayers });
      io.to(room.code).emit("playerJoined", { username: name, players, hostId: room.host });
      io.to(room.code).emit("gamePhase",    { phase: "waiting" });
      io.to(room.code).emit("waiting",      { message: `Waiting for players… (${players.length}/${room.maxPlayers})` });

      callback({ success: true, roomCode: room.code });
    } catch (err) {
      console.error("createRoom error:", err);
      callback({ success: false, error: "Server error" });
    }
  });

  socket.on("joinRoomByCode", async (opts: any, callback: (r: any) => void) => {
    try {
      const code = String(opts?.roomCode ?? "").toUpperCase().trim();
      const name = String(opts?.username ?? "").trim().slice(0, 8) || "Player";

      const room = await getRoom(code);
      if (!room)                                  return callback({ success: false, error: "Room not found. Check your code!" });
      if (room.status !== "active")               return callback({ success: false, error: "Room is unavailable. Create your own!" });
      if (room.players.length >= room.maxPlayers) return callback({ success: false, error: "Room is full." });

      const allowed = await checkAndRegisterSocket(code, socket.id, userId, socket);
      if (!allowed) return callback({ success: false, error: "You are already in this room in another tab." });

      // If this socket is already in this room (e.g. page reload), just update name
      const alreadyIn = socketToRoom.get(socket.id) === code;
      if (!alreadyIn) {
        await addPlayerToRoom(code, socket.id, name);
        socket.join(code);
        socketToRoom.set(socket.id, code);
        socketToName.set(socket.id, name);
      } else {
        socketToName.set(socket.id, name);
      }

      if (!gameServices.has(code)) {
        const gs = new GameService(code, io, strokeBuffers);
        gs.setConfig(room.rounds, room.roundTime, room.maxPlayers);
        gameServices.set(code, gs);
      }
      if (!strokeBuffers.has(code)) strokeBuffers.set(code, []);

      const players = await buildPlayerList(code);
      const updRoom = await getRoom(code);
      const hostId  = updRoom?.host ?? "";
      const gs      = gameServices.get(code);
      const phase   = gs?.getPhase() ?? "waiting";

      socket.emit("playerList",  { players, maxPlayers: room.maxPlayers });
      socket.emit("gamePhase",   { phase, maxRounds: gs?.getMaxRounds(), round: gs?.getRound() });

      const strokes = strokeBuffers.get(code) ?? [];
      if (strokes.length > 0) socket.emit("fullRedraw", { history: strokes });

      if (phase === "drawing" && gs) {
        socket.emit("roundStart", {
          round:          gs.getRound(),
          drawerId:       gs.getCurrentDrawerId(),
          drawerUsername: socketToName.get(gs.getCurrentDrawerId()) ?? "",
          wordHint:       gs.getWordHint(),
          wordLengths:    gs.getWordLengths(),
          timeLeft:       gs.getTimeLeft(),
        });
      }

      if (!alreadyIn) {
        io.to(code).emit("playerJoined", { username: name, players, hostId });
        io.to(code).emit("playerList",   { players, maxPlayers: room.maxPlayers });
      }

      callback({ success: true, room: updRoom });
    } catch (err) {
      console.error("joinRoomByCode error:", err);
      callback({ success: false, error: "Server error" });
    }
  });

  socket.on("joinGame", async ({ username, roomCode }: { username?: string; roomCode?: string }) => {
    const code = String(roomCode ?? "").toUpperCase().trim();
    const name = String(username ?? "").trim().slice(0, 8) || "Player";

    socketToName.set(socket.id, name);

    const existing = socketToRoom.get(socket.id);
    if (existing) {
      await broadcastPlayerList(existing);
      return;
    }

    if (!code) return;

    const room = await getRoom(code);
    if (!room || room.status !== "active") return;
    if (room.players.length >= room.maxPlayers) return;

    const allowed = await checkAndRegisterSocket(code, socket.id, userId, socket);
    if (!allowed) {
      socket.emit("kicked", { reason: "duplicate_tab", redirectTo: "/" });
      return;
    }

    await addPlayerToRoom(code, socket.id, name);
    socket.join(code);
    socketToRoom.set(socket.id, code);

    if (!strokeBuffers.has(code)) strokeBuffers.set(code, []);
    if (!gameServices.has(code)) {
      const gs = new GameService(code, io, strokeBuffers);
      gs.setConfig(room.rounds, room.roundTime, room.maxPlayers);
      gameServices.set(code, gs);
    }

    const players = await buildPlayerList(code);
    const gs      = gameServices.get(code);
    const phase   = gs?.getPhase() ?? "waiting";

    io.to(code).emit("playerJoined", { username: name, players, hostId: room.host });
    io.to(code).emit("playerList",   { players, maxPlayers: room.maxPlayers });
    socket.emit("gamePhase", { phase, maxRounds: gs?.getMaxRounds(), round: gs?.getRound() });

    const strokes = strokeBuffers.get(code) ?? [];
    if (strokes.length > 0) socket.emit("fullRedraw", { history: strokes });

    if (phase === "drawing" && gs) {
      socket.emit("roundStart", {
        round:          gs.getRound(),
        drawerId:       gs.getCurrentDrawerId(),
        drawerUsername: socketToName.get(gs.getCurrentDrawerId()) ?? "",
        wordHint:       gs.getWordHint(),
        wordLengths:    gs.getWordLengths(),
        timeLeft:       gs.getTimeLeft(),
      });
    }
  });

  socket.on("startGame", async () => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;

    const room = await getRoom(roomCode);
    if (!room || room.host !== socket.id) return;

    const gs = gameServices.get(roomCode);
    if (!gs) return;

    if (room.players.length < GAME_CONFIG.MIN_PLAYERS) {
      socket.emit("waiting", { message: `Need at least ${GAME_CONFIG.MIN_PLAYERS} players to start!` });
      return;
    }

    const drawerQueue = room.players.map((p) => p.socketId);
    const playerInfos = room.players.map((p) => ({ socketId: p.socketId, username: p.username }));
    gs.start(drawerQueue, playerInfos);
  });

  // ── restartGame (host only — Play Again after gameEnd) ─────────────────────
  socket.on("restartGame", async () => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;

    const room = await getRoom(roomCode);
    if (!room || room.host !== socket.id) return; // host only

    const gs = gameServices.get(roomCode);
    if (!gs || gs.getPhase() !== "gameEnd") return;

    gs.restartGame();
  });

  socket.on("selectWord", ({ choiceIndex }: { choiceIndex: number }) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    gameServices.get(roomCode)?.selectWord(socket.id, choiceIndex);
  });

  socket.on("draw", (event: any) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;

    const gs = gameServices.get(roomCode);
    if (!gs?.isCurrentDrawer(socket.id)) return;
    if (gs.getPhase() !== "drawing") return;

    if (!event.endStroke) {
      const buf = strokeBuffers.get(roomCode) ?? [];
      buf.push(event);
      if (buf.length > 2000) buf.splice(0, buf.length - 2000);
      strokeBuffers.set(roomCode, buf);
    }

    socket.to(roomCode).emit("draw", event);
  });

  socket.on("undo", ({ clientId }: { clientId: string }) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;

    const gs = gameServices.get(roomCode);
    if (!gs?.isCurrentDrawer(socket.id)) return;

    const buf = strokeBuffers.get(roomCode) ?? [];
    let lastStrokeId: string | null = null;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].clientId === clientId && buf[i].strokeId) {
        lastStrokeId = buf[i].strokeId;
        break;
      }
    }

    if (lastStrokeId) {
      const filtered = buf.filter((e) => e.strokeId !== lastStrokeId);
      strokeBuffers.set(roomCode, filtered);
      io.to(roomCode).emit("fullRedraw", { history: filtered });
    }
  });

  socket.on("clear", () => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    const gs = gameServices.get(roomCode);
    if (!gs?.isCurrentDrawer(socket.id)) return;
    strokeBuffers.set(roomCode, []);
    io.to(roomCode).emit("clear");
  });

  socket.on("guess", ({ text }: { text: string }) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    const username = socketToName.get(socket.id) ?? "Player";
    gameServices.get(roomCode)?.handleGuess(socket.id, username, String(text ?? "").trim());
  });

  socket.on("activity", async () => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) return;
    const { updatePlayerActivity } = await import("./services/roomService");
    await updatePlayerActivity(roomCode, socket.id).catch(() => {});
  });

  socket.on("leaveRoom", async () => {
    await handleLeave(socket);
  });

  socket.on("disconnect", async () => {
    console.log(`[-] ${socket.id} disconnected`);
    await handleLeave(socket);
  });
});

async function handleLeave(socket: Socket): Promise<void> {
  const roomCode = socketToRoom.get(socket.id);
  if (!roomCode) return;

  socketToRoom.delete(socket.id);
  socketToName.delete(socket.id);

  const uid = socketToUID.get(socket.id);
  if (uid) {
    await redisDel(sockKey(roomCode, uid));
    socketToUID.delete(socket.id);
  }

  const gs = gameServices.get(roomCode);

  if (gs?.isCurrentDrawer(socket.id) && gs.getPhase() === "drawing") {
    gs.endRound("drawer_left");
  }

  gs?.removePlayer(socket.id);

  const room = await removePlayerFromRoom(roomCode, socket.id);

  if (!room || room.players.length === 0) {
    gameServices.get(roomCode)?.stop();
    gameServices.delete(roomCode);
    strokeBuffers.delete(roomCode);
    return;
  }

  const players = await buildPlayerList(roomCode);
  const hostId  = room.host ?? "";
  io.to(roomCode).emit("playerLeft",  { players, hostId });
  io.to(roomCode).emit("playerList",  { players, maxPlayers: room.maxPlayers });
}

app.get("/health", (_, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: "ok",
    activeRooms: strokeBuffers.size,
    connectedSockets: io.sockets.sockets.size,
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
  });
});

const PORT = parseInt(process.env.PORT ?? "5000", 10);

async function bootstrap(): Promise<void> {
  await connectRedis();
  await connectDB();

  // Log memory usage at startup
  const initMem = process.memoryUsage();
  console.log(`📊 Init memory: heap ${Math.round(initMem.heapUsed / 1024 / 1024)}MB / ${Math.round(initMem.heapTotal / 1024 / 1024)}MB, rss ${Math.round(initMem.rss / 1024 / 1024)}MB`);

  const available = await getAvailableRoomsCount();
  if (available < 20) {
    await preCreateRooms(25);
  } else {
    console.log(`✓ Room pool: ${available} available rooms`);
  }

  // Log memory periodically
  setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`📊 Memory: heap ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB, rooms: ${strokeBuffers.size}, sockets: ${io.sockets.sockets.size}`);
  }, 30_000);

  // ── Idle-kick service ────────────────────────────────────────────────────────
  // Emit "kicked" to idle sockets WITHOUT disconnecting them.
  // Keeping the socket alive means the home page sees it as connected
  // immediately — no "🔌 Connecting…" flash on the button.
  startIdleCheckService(30_000, async (code, idleSockets, newHostId) => {
    const gs = gameServices.get(code);

    for (const sid of idleSockets) {
      const sock = io.sockets.sockets.get(sid);
      if (sock) {
        sock.emit("kicked", { reason: "idle" });
        sock.leave(code); // leave the Socket.io room but stay connected
      }

      // Clean up server-side maps
      socketToRoom.delete(sid);
      socketToName.delete(sid);
      const uid = socketToUID.get(sid);
      if (uid) {
        await redisDel(sockKey(code, uid));
        socketToUID.delete(sid);
      }

      // If the kicked player was drawing, end the round
      if (gs?.isCurrentDrawer(sid) && gs.getPhase() === "drawing") {
        gs.endRound("idle_kick");
      }
      gs?.removePlayer(sid);
    }

    // Notify remaining players
    const room = await getRoom(code);
    if (!room || room.players.length === 0) {
      gs?.stop();
      gameServices.delete(code);
      strokeBuffers.delete(code);
      return;
    }

    const players = await buildPlayerList(code);
    const hostId  = newHostId ?? room.host ?? "";
    io.to(code).emit("playerLeft", { players, hostId });
    io.to(code).emit("playerList", { players, maxPlayers: room.maxPlayers });
    if (newHostId) {
      io.to(code).emit("hostTransferred", { newHostId });
    }
  });

  startCleanupService(60_000);

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✓ Server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});