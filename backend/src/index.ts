import express from "express";
import http    from "http";
import { Server } from "socket.io";
import cors   from "cors";
import { GAME_CONFIG } from "./config/gameConfig";
import { WORDS } from "./data/words";
import {
  connectRedis,
  preCreateRooms,
  assignRoom,
  getAvailableRoomsCount,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  updatePlayerActivity,
  checkIdlePlayersInRoom,
  startIdleCheckService,
  startCleanupService,
  cleanupExcessRooms,
  autoCreateRoomsIfNeeded,
  MAX_USERNAME_LENGTH,
  RoomCreateOptions,
} from "./service/roomService";

const PORT       = process.env.PORT       || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const NODE_ENV   = process.env.NODE_ENV   || "development";

console.log(`✓ Word dictionary loaded: ${WORDS.length} words`);

// ─── Word helpers ──────────────────────────────────────────────────────────────

function pickWords(count: number, exclude: Set<string>): string[] {
  const pool = WORDS.filter((w) => !exclude.has(w));
  const source = pool.length >= count ? pool : WORDS; // fallback if pool exhausted
  const picked: string[] = [];
  const used = new Set<string>();
  let attempts = 0;
  while (picked.length < count && attempts < count * 10) {
    const w = source[Math.floor(Math.random() * source.length)];
    if (!used.has(w)) { picked.push(w); used.add(w); }
    attempts++;
  }
  return picked;
}

/**
 * Build the underscore hint shown to guessers.
 * "Fire Ball" → "_ _ _ _   _ _ _ _"
 * Each space between words becomes a visual triple-space gap.
 * revealedIndices contains global char indices (spaces excluded) to reveal.
 */
function buildHint(word: string, revealedIndices: Set<number> = new Set()): string {
  const wordParts = word.split(" ");
  let globalIdx = 0;
  return wordParts
    .map((part) => {
      const partHint = part
        .split("")
        .map((c) => {
          const revealed = revealedIndices.has(globalIdx);
          globalIdx++;
          return revealed ? c : "_";
        })
        .join(" ");
      globalIdx++; // account for the space between words
      return partHint;
    })
    .join("   "); // triple space visually separates word groups
}

/** Returns all non-space letter indices (0-based, space chars skipped) */
function letterIndices(word: string): number[] {
  const indices: number[] = [];
  let idx = 0;
  for (const c of word) {
    if (c !== " ") indices.push(idx);
    idx++;
  }
  return indices;
}

/** Word lengths per word-part, e.g. "Fire Ball" → [4,4] */
function wordLengths(word: string): number[] {
  return word.split(" ").map((p) => p.length);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServerPlayer {
  id: string;
  username: string;
  score: number;
  hasGuessed: boolean;
  joinedAt: number;
}

export interface ScoreDelta {
  id: string;
  username: string;
  delta: number;
}

type GamePhase = "waiting" | "starting" | "selectingWord" | "drawing" | "roundEnd" | "gameEnd";

interface GameState {
  phase: GamePhase;
  drawOrder: string[];
  drawerIndex: number;
  currentWord: string | null;
  wordChoices: string[];          // current set offered to drawer
  wordHint: string;
  wordLengths: number[];
  revealedIndices: Set<number>;   // char positions revealed as hints so far
  hintsGiven: number;
  timeLeft: number;
  wordSelectTimeLeft: number;
  round: number;
  maxRounds: number;
  roundStartTime: number;
  scoreAtRoundStart: Map<string, number>;
  timerInterval: ReturnType<typeof setInterval> | null;
  wordSelectTimeout: ReturnType<typeof setTimeout> | null;
  startTimeout: ReturnType<typeof setTimeout> | null;
  roundEndTimeout: ReturnType<typeof setTimeout> | null;
  usedWords: Set<string>;
}

// ─── State ────────────────────────────────────────────────────────────────────

const socketToRoom = new Map<string, string>();
const players = new Map<string, ServerPlayer>();
let drawHistory: any[] = [];

// Room-specific settings (loaded when game starts)
let roomRoundTime: number = GAME_CONFIG.ROUND_TIME;
let roomMaxRounds: number = GAME_CONFIG.MAX_ROUNDS;

const game: GameState = {
  phase: "waiting",
  drawOrder: [],
  drawerIndex: 0,
  currentWord: null,
  wordChoices: [],
  wordHint: "",
  wordLengths: [],
  revealedIndices: new Set(),
  hintsGiven: 0,
  timeLeft: GAME_CONFIG.ROUND_TIME,
  wordSelectTimeLeft: GAME_CONFIG.WORD_SELECT_TIME,
  round: 0,
  maxRounds: GAME_CONFIG.MAX_ROUNDS,
  roundStartTime: 0,
  scoreAtRoundStart: new Map(),
  timerInterval: null,
  wordSelectTimeout: null,
  startTimeout: null,
  roundEndTimeout: null,
  usedWords: new Set(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function playerList() {
  return Array.from(players.values()).map((p) => ({
    id: p.id,
    username: p.username,
    score: p.score,
    hasGuessed: p.hasGuessed,
    isDrawing: game.drawOrder[game.drawerIndex] === p.id,
  }));
}

async function getPlayerListWithMaxPlayers() {
  const list = playerList();
  // Get maxPlayers from any connected player's room
  let maxPlayers = 8;
  for (const [socketId, roomCode] of socketToRoom.entries()) {
    const room = await getRoom(roomCode);
    if (room) {
      maxPlayers = room.maxPlayers;
      break;
    }
  }
  return { players: list, maxPlayers };
}

function clearTimers() {
  if (game.timerInterval)     { clearInterval(game.timerInterval);    game.timerInterval    = null; }
  if (game.wordSelectTimeout) { clearTimeout(game.wordSelectTimeout); game.wordSelectTimeout = null; }
  if (game.startTimeout)      { clearTimeout(game.startTimeout);      game.startTimeout     = null; }
  if (game.roundEndTimeout)   { clearTimeout(game.roundEndTimeout);   game.roundEndTimeout  = null; }
}

function allNonDrawersGuessed(): boolean {
  const drawerId = game.drawOrder[game.drawerIndex];
  for (const [id, p] of players) {
    if (id === drawerId) continue;
    if (!p.hasGuessed) return false;
  }
  return players.size > 1;
}

function computeScoreDeltas(): ScoreDelta[] {
  return Array.from(players.values()).map((p) => ({
    id: p.id,
    username: p.username,
    delta: p.score - (game.scoreAtRoundStart.get(p.id) ?? p.score),
  }));
}

// ─── Express / Socket.IO ──────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: CLIENT_URL } });

// ─── Game logic ───────────────────────────────────────────────────────────────

async function broadcastPlayerList() {
  const data = await getPlayerListWithMaxPlayers();
  io.emit("playerList", data);
}

function startCountdown() {
  if (game.phase !== "waiting") return;
  if (players.size < GAME_CONFIG.MIN_PLAYERS) {
    io.emit("waiting", { message: `⏳ Need at least ${GAME_CONFIG.MIN_PLAYERS} players to start.` });
    return;
  }
  game.phase = "starting";
  
  // Load room settings before emitting
  void loadRoomSettings().then(() => {
    io.emit("gamePhase", { phase: "starting", maxRounds: game.maxRounds });
    game.startTimeout = setTimeout(() => startRound(), GAME_CONFIG.COUNTDOWN_DELAY_MS);
  });
}

async function loadRoomSettings() {
  try {
    // Get any roomCode from socketToRoom map
    let roomCode: string | undefined;
    for (const code of socketToRoom.values()) {
      roomCode = code;
      break;
    }

    if (roomCode) {
      const room = await getRoom(roomCode);
      if (room) {
        roomRoundTime = room.roundTime > 0 ? room.roundTime : GAME_CONFIG.ROUND_TIME;
        roomMaxRounds = room.rounds > 0 ? room.rounds : GAME_CONFIG.MAX_ROUNDS;
        game.maxRounds = roomMaxRounds;
        game.timeLeft = roomRoundTime;
        console.log(`✓ Loaded room settings: ${roomMaxRounds} rounds, ${roomRoundTime}s per round`);
        return;
      }
    }
  } catch (error) {
    console.error("Failed to load room settings:", error);
  }

  // Fallback to defaults
  roomRoundTime = GAME_CONFIG.ROUND_TIME;
  roomMaxRounds = GAME_CONFIG.MAX_ROUNDS;
  game.maxRounds = roomMaxRounds;
  game.timeLeft = roomRoundTime;
}

/** Phase 1: pick word choices and send to drawer */
function startRound() {
  if (players.size < GAME_CONFIG.MIN_PLAYERS) {
    game.phase = "waiting";
    io.emit("gamePhase", { phase: "waiting" });
    io.emit("waiting", { message: "⏳ Not enough players. Waiting..." });
    return;
  }

  // Load room settings at the start of each round
  void loadRoomSettings();

  // Advance round counter when all drawers in a round have gone
  if (game.drawerIndex >= game.drawOrder.length) {
    game.round++;
    game.drawerIndex = 0;
    game.drawOrder = Array.from(players.keys());
  }

  if (game.round > game.maxRounds) { endGame(); return; }

  // First call: initialise round counter
  if (game.round === 0) {
    game.round = 1;
    game.drawOrder = Array.from(players.keys());
  }

  const drawerId = game.drawOrder[game.drawerIndex];
  const drawer   = players.get(drawerId);

  if (!drawer) { game.drawerIndex++; startRound(); return; }

  // Reset guesser state
  for (const p of players.values()) p.hasGuessed = false;

  // Snapshot scores so we can compute round deltas later
  game.scoreAtRoundStart = new Map(Array.from(players.entries()).map(([id, p]) => [id, p.score]));

  // Pick word choices (avoid recently used)
  const choices = pickWords(GAME_CONFIG.WORD_CHOICES_COUNT, game.usedWords);
  game.wordChoices    = choices;
  game.currentWord    = null;
  game.revealedIndices = new Set();
  game.hintsGiven     = 0;

  game.phase = "selectingWord";
  game.wordSelectTimeLeft = GAME_CONFIG.WORD_SELECT_TIME;

  // Clear canvas for new round
  drawHistory = [];
  io.emit("clear");

  // Tell drawer to pick a word
  const drawerSocket = io.sockets.sockets.get(drawerId);
  if (drawerSocket) {
    drawerSocket.emit("wordChoices", {
      choices,
      round: game.round,
      drawerUsername: drawer.username,
      wordSelectTime: GAME_CONFIG.WORD_SELECT_TIME,
    });
  }

  // Tell everyone else to wait
  io.emit("gamePhase", {
    phase: "selectingWord",
    round: game.round,
    maxRounds: game.maxRounds,
    drawerUsername: drawer.username,
  });

  broadcastPlayerList();

  // Auto-select a random word if drawer doesn't pick in time
  game.wordSelectTimeout = setTimeout(() => {
    const randomChoice = choices[Math.floor(Math.random() * choices.length)];
    beginDrawingPhase(drawerId, randomChoice);
  }, GAME_CONFIG.WORD_SELECT_TIME * 1000);
}

/** Phase 2: word has been confirmed — start the actual drawing timer */
function beginDrawingPhase(drawerId: string, word: string) {
  clearTimers();

  game.usedWords.add(word);
  game.currentWord  = word;
  game.wordHint     = buildHint(word);
  game.wordLengths  = wordLengths(word);
  game.phase        = "drawing";
  game.timeLeft     = roomRoundTime;
  game.roundStartTime = Date.now();
  game.revealedIndices = new Set();
  game.hintsGiven   = 0;

  const drawer = players.get(drawerId);

  const roundData = {
    round: game.round,
    drawerId,
    drawerUsername: drawer?.username ?? "",
    wordHint:    game.wordHint,
    wordLengths: game.wordLengths,
    timeLeft:    game.timeLeft,
  };

  io.emit("roundStart", roundData);
  broadcastPlayerList();

  // Send actual word only to the drawer
  const drawerSocket = io.sockets.sockets.get(drawerId);
  if (drawerSocket) drawerSocket.emit("yourWord", { word });

  // Hint-reveal thresholds (% of round time remaining when we reveal)
  // e.g. for 80s: first at 53s left (~2/3 remaining), second at 27s (~1/3)
  const hintAt: number[] = [];
  for (let i = 1; i <= GAME_CONFIG.MAX_HINT_REVEALS; i++) {
    hintAt.push(Math.floor(roomRoundTime * (1 - i / (GAME_CONFIG.MAX_HINT_REVEALS + 1))));
  }

  // Start countdown timer
  game.timerInterval = setInterval(() => {
    game.timeLeft--;
    io.emit("timerUpdate", { timeLeft: game.timeLeft });

    // Reveal hint?
    if (game.hintsGiven < GAME_CONFIG.MAX_HINT_REVEALS && hintAt.includes(game.timeLeft)) {
      const allLetters  = letterIndices(game.currentWord!);
      const unrevealed  = allLetters.filter((i) => !game.revealedIndices.has(i));
      if (unrevealed.length > 0) {
        const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)];
        game.revealedIndices.add(pick);
        game.hintsGiven++;
        game.wordHint = buildHint(game.currentWord!, game.revealedIndices);
        io.emit("hintUpdate", { wordHint: game.wordHint });
      }
    }

    if (game.timeLeft <= 0) endRound();
  }, 1000);
}

function endRound() {
  if (game.phase !== "drawing") return;
  clearTimers();

  game.phase = "roundEnd";
  const word = game.currentWord ?? "";

  // Award drawer bonus: 20 pts per correct guesser
  const drawerId = game.drawOrder[game.drawerIndex];
  const drawer   = players.get(drawerId);
  if (drawer) {
    const correctCount = Array.from(players.values()).filter((p) => p.hasGuessed).length;
    drawer.score += correctCount * 20;
  }

  const deltas = computeScoreDeltas();

  io.emit("roundEnd", { word, players: playerList(), scoreDelta: deltas });
  broadcastPlayerList();

  game.drawerIndex++;

  game.roundEndTimeout = setTimeout(() => {
    if (game.drawerIndex >= game.drawOrder.length && game.round >= game.maxRounds) {
      endGame();
    } else {
      startRound();
    }
  }, GAME_CONFIG.ROUND_END_PAUSE_MS);
}

function endGame() {
  clearTimers();
  game.phase = "gameEnd";

  const sorted = Array.from(players.values()).sort((a, b) => b.score - a.score);
  const winner = sorted[0] ?? { id: "", username: "Nobody", score: 0 };

  io.emit("gameEnd", {
    winner: { id: winner.id, username: winner.username, score: winner.score },
    players: playerList(),
  });

  setTimeout(() => resetGame(), GAME_CONFIG.GAME_RESET_DELAY_MS);
}

function resetGame() {
  clearTimers();
  game.phase        = "waiting";
  game.drawOrder    = [];
  game.drawerIndex  = 0;
  game.currentWord  = null;
  game.wordChoices  = [];
  game.wordHint     = "";
  game.wordLengths  = [];
  game.revealedIndices = new Set();
  game.hintsGiven   = 0;
  game.timeLeft     = GAME_CONFIG.ROUND_TIME;
  game.round        = 0;
  game.roundStartTime = 0;
  game.scoreAtRoundStart = new Map();
  game.usedWords.clear();

  for (const p of players.values()) { p.score = 0; p.hasGuessed = false; }

  drawHistory = [];
  io.emit("clear");
  io.emit("gamePhase", { phase: "waiting" });
  broadcastPlayerList();

  if (players.size >= GAME_CONFIG.MIN_PLAYERS) startCountdown();
}

// ─── Idle Check Service ───────────────────────────────────────────────────────

startIdleCheckService(30000, (roomCode, idleSockets, newHostId) => {
  // Only handle idle players if game is actually running (not in waiting phase)
  if (game.phase === "waiting") {
    return;
  }

  // Handle idle players
  for (const socketId of idleSockets) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit("kicked", { reason: "idle", redirectTo: "/" });
      socket.disconnect();
    }
    socketToRoom.delete(socketId);
  }

  // Notify room of host transfer if applicable
  if (newHostId) {
    io.to(roomCode).emit("hostTransferred", { newHostId });
  }

  // Broadcast updated room state
  io.to(roomCode).emit("roomUpdated");
});

// ─── Room Cleanup Service ─────────────────────────────────────────────────────

startCleanupService(60000); // Run cleanup every 60 seconds

// ─── Socket.IO ────────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.emit("clientCountUpdate", { count: io.engine.clientsCount });
  io.emit("clientCountUpdate",     { count: io.engine.clientsCount });

  // Replay draw history for late joiners
  drawHistory.forEach((ev) => socket.emit("draw", ev));

  // ── joinGame ───────────────────────────────────────────────────────────────
  socket.on("joinGame", ({ username }: { username: string }) => {
    const safeName = String(username ?? "").trim().slice(0, 20) || "Guest";

    if (!players.has(socket.id)) {
      players.set(socket.id, {
        id: socket.id, username: safeName,
        score: 0, hasGuessed: false, joinedAt: Date.now(),
      });
    } else {
      players.get(socket.id)!.username = safeName;
    }

    broadcastPlayerList();

    // Catch up if game is already in progress
    if (game.phase === "drawing") {
      const drawerId = game.drawOrder[game.drawerIndex];
      const drawer   = players.get(drawerId);
      socket.emit("roundStart", {
        round: game.round, drawerId,
        drawerUsername: drawer?.username ?? "",
        wordHint: game.wordHint,
        wordLengths: game.wordLengths,
        timeLeft: game.timeLeft,
      });
    } else if (game.phase === "selectingWord") {
      const drawerId = game.drawOrder[game.drawerIndex];
      const drawer   = players.get(drawerId);
      socket.emit("gamePhase", {
        phase: "selectingWord",
        round: game.round,
        maxRounds: game.maxRounds,
        drawerUsername: drawer?.username ?? "",
      });
    }

    io.emit("waiting",    { message: `👋 ${safeName} joined!` });
    io.emit("gamePhase",  { phase: game.phase, maxRounds: game.maxRounds });
  });

  socket.on("createRoom", async (options: RoomCreateOptions, callback?: (result: { success: boolean; roomCode?: string; error?: string }) => void) => {
    try {
      // If socket was in a previous room, leave it first
      const previousRoom = socketToRoom.get(socket.id);
      if (previousRoom) {
        socket.leave(previousRoom);
      }

      // Extract client IP address
      const clientIP =
        (socket.handshake.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
        socket.handshake.address ||
        "unknown";

      const room = await assignRoom(socket.id, clientIP, options);
      if (!room) {
        callback?.({ success: false, error: "No available rooms" });
        return;
      }
      
      // Add the host as the first player in the room
      const safeName = String(options.username ?? "").trim().slice(0, MAX_USERNAME_LENGTH) || "Host";
      const updatedRoom = await addPlayerToRoom(room.code, socket.id, safeName);
      
      // Track socket-to-room mapping
      socketToRoom.set(socket.id, room.code);
      socket.join(room.code);
      
      // Auto-create new rooms if available count drops below threshold
      await autoCreateRoomsIfNeeded();
      
      callback?.({ success: true, roomCode: room.code });
      io.to(room.code).emit("roomCreated", { roomCode: room.code, hostId: socket.id });
    } catch (error) {
      console.error("Room assignment failed:", error);
      callback?.({ success: false, error: String(error) });
    }
  });

  // ── joinRoom (join an existing room by code) ──────────────────────────────
  socket.on("joinRoom", async (data: { roomCode: string; username: string }, callback?: (result: { success: boolean; error?: string }) => void) => {
    try {
      const room = await getRoom(data.roomCode);
      
      // Room doesn't exist
      if (!room) {
        callback?.({ success: false, error: "Room not found" });
        return;
      }

      // Room is full
      if (room.maxPlayers > 0 && room.players.length >= room.maxPlayers) {
        callback?.({ success: false, error: "Room is full" });
        return;
      }

      // If socket was in a previous room, leave it first
      const previousRoom = socketToRoom.get(socket.id);
      if (previousRoom) {
        socket.leave(previousRoom);
      }

      // Add player to room
      const safeName = String(data.username ?? "").trim().slice(0, MAX_USERNAME_LENGTH) || "Guest";
      const updatedRoom = await addPlayerToRoom(room.code, socket.id, safeName);
      
      if (!updatedRoom) {
        callback?.({ success: false, error: "Failed to join room" });
        return;
      }

      // Track socket-to-room mapping
      socketToRoom.set(socket.id, room.code);
      socket.join(room.code);

      // Add player to game state
      if (!players.has(socket.id)) {
        players.set(socket.id, {
          id: socket.id, username: safeName,
          score: 0, hasGuessed: false, joinedAt: Date.now(),
        });
      }

      callback?.({ success: true });
      
      // Notify room of new player
      io.to(room.code).emit("playerJoined", { username: safeName, players: Array.from(players.values()), hostId: room.host });
      io.to(room.code).emit("playerList", await getPlayerListWithMaxPlayers());
    } catch (error) {
      console.error("Room join failed:", error);
      callback?.({ success: false, error: String(error) });
    }
  });

  // ── startGame (host manually starts the game) ───────────────────────────────
  socket.on("startGame", () => {
    if (game.phase !== "waiting") {
      socket.emit("error", { message: "Game is not in waiting phase" });
      return;
    }

    if (players.size < GAME_CONFIG.MIN_PLAYERS) {
      socket.emit("error", { message: `Need at least ${GAME_CONFIG.MIN_PLAYERS} players to start` });
      return;
    }

    // Only host can start the game
    // For now, we'll allow any player to start (can be restricted to host later)
    startCountdown();
  });

  // ── selectWord (drawer picks from the offered choices) ─────────────────────
  socket.on("selectWord", ({ choiceIndex }: { choiceIndex: number }) => {
    if (game.phase !== "selectingWord") return;
    if (game.drawOrder[game.drawerIndex] !== socket.id) return;

    const word = game.wordChoices[choiceIndex];
    if (!word) return;

    clearTimers(); // cancel auto-select timeout
    beginDrawingPhase(socket.id, word);
  });

  // ── draw ───────────────────────────────────────────────────────────────────
  socket.on("draw", (data) => {
    if (game.phase === "drawing" && game.drawOrder[game.drawerIndex] !== socket.id) return;
    drawHistory.push(data);
    io.emit("draw", data);
  });

  // ── undo ───────────────────────────────────────────────────────────────────
  socket.on("undo", ({ clientId }: { clientId: string }) => {
    let targetStrokeId: string | null = null;
    for (let i = drawHistory.length - 1; i >= 0; i--) {
      const ev = drawHistory[i];
      if (ev.clientId !== clientId) continue;
      if (ev.strokeId) { targetStrokeId = ev.strokeId; break; }
      drawHistory.splice(i, 1);
      io.emit("fullRedraw", { history: drawHistory });
      return;
    }
    if (!targetStrokeId) { socket.emit("fullRedraw", { history: drawHistory }); return; }
    drawHistory = drawHistory.filter((ev) => ev.strokeId !== targetStrokeId);
    io.emit("fullRedraw", { history: drawHistory });
  });

  // ── clear ──────────────────────────────────────────────────────────────────
  socket.on("clear", () => {
    if (game.phase === "drawing" && game.drawOrder[game.drawerIndex] !== socket.id) return;
    drawHistory = [];
    io.emit("clear");
  });

  // ── guess / chat ───────────────────────────────────────────────────────────
  socket.on("guess", ({ text }: { text: string }) => {
    const player = players.get(socket.id);
    if (!player) return;
    const safeTxt = String(text ?? "").trim().slice(0, 80);
    if (!safeTxt) return;
    if (game.drawOrder[game.drawerIndex] === socket.id) return;
    if (player.hasGuessed) return;

    const isCorrect =
      game.phase === "drawing" &&
      game.currentWord !== null &&
      safeTxt.toLowerCase() === game.currentWord.toLowerCase();

    if (isCorrect) {
      const elapsed = (Date.now() - game.roundStartTime) / 1000;
      const points  = Math.max(50, Math.round(100 - elapsed * 0.7));
      player.score     += points;
      player.hasGuessed = true;

      io.emit("correctGuess", { playerId: socket.id, username: player.username, points });
      broadcastPlayerList();

      if (allNonDrawersGuessed()) endRound();
    } else {
      io.emit("newChatMessage", {
        id: `msg-${socket.id}-${Date.now()}`,
        playerId: socket.id, username: player.username,
        text: safeTxt, type: "chat" as const, timestamp: Date.now(),
      });
    }
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    console.log("User disconnected:", socket.id, player?.username);
    if (player) io.emit("waiting", { message: `👋 ${player.username} left.` });

    players.delete(socket.id);
    io.emit("clientCountUpdate", { count: io.engine.clientsCount });
    broadcastPlayerList();

    if (game.phase === "drawing" && game.drawOrder[game.drawerIndex] === socket.id) {
      endRound();
    }
    if (game.phase === "selectingWord" && game.drawOrder[game.drawerIndex] === socket.id) {
      // Drawer disconnected during word select — skip to next
      clearTimers();
      game.drawerIndex++;
      startRound();
    }

    if (players.size < GAME_CONFIG.MIN_PLAYERS &&
        (game.phase === "drawing" || game.phase === "starting" || game.phase === "selectingWord")) {
      clearTimers();
      game.phase = "waiting";
      game.round = 0;
      game.drawerIndex = 0;
      drawHistory = [];
      io.emit("clear");
      io.emit("gamePhase", { phase: "waiting" });
      io.emit("waiting",   { message: "⏳ Not enough players. Waiting for more..." });
    }
  });

  // ── joinRoomByCode ────────────────────────────────────────────────────────────
  socket.on("joinRoomByCode", async ({ roomCode, username }: { roomCode: string; username: string }, callback?: (result: { success: boolean; room?: any; error?: string }) => void) => {
    try {
      const room = await getRoom(roomCode);
      if (!room) {
        callback?.({ success: false, error: "Room not found" });
        return;
      }

      if (room.status === "ended") {
        callback?.({ success: false, error: "Room has ended" });
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        callback?.({ success: false, error: "Room is full" });
        return;
      }

      // Add player to room
      const safeName = String(username ?? "").trim().slice(0, MAX_USERNAME_LENGTH) || "Guest";
      const updatedRoom = await addPlayerToRoom(roomCode, socket.id, safeName);

      // Leave previous room if socket is already in one
      const previousRoom = socketToRoom.get(socket.id);
      if (previousRoom) {
        socket.leave(previousRoom);
      }

      // Track socket-to-room mapping
      socketToRoom.set(socket.id, roomCode);
      socket.join(roomCode);

      callback?.({ success: true, room: updatedRoom });
      io.to(roomCode).emit("playerJoined", {
        username: safeName,
        players: updatedRoom?.players,
        hostId: updatedRoom?.host,
      });
    } catch (error) {
      console.error("Join room failed:", error);
      callback?.({ success: false, error: String(error) });
    }
  });

  // ── activity ──────────────────────────────────────────────────────────────────
  socket.on("activity", async () => {
    const roomCode = socketToRoom.get(socket.id);
    if (roomCode) {
      await updatePlayerActivity(roomCode, socket.id);
    }
  });

  // ── leaveRoom ─────────────────────────────────────────────────────────────────
  socket.on("leaveRoom", async () => {
    const roomCode = socketToRoom.get(socket.id);
    if (roomCode) {
      const updatedRoom = await removePlayerFromRoom(roomCode, socket.id);
      socketToRoom.delete(socket.id);
      socket.leave(roomCode);

      if (updatedRoom) {
        io.to(roomCode).emit("playerLeft", {
          players: updatedRoom.players,
          hostId: updatedRoom.host,
        });
      }
    }
  });

  socket.on("getClientCount", () => {
    socket.emit("clientCountUpdate", { count: io.engine.clientsCount });
  });
});

// ─── HTTP ─────────────────────────────────────────────────────────────────────

app.get("/api/status", (_req, res) => {
  res.json({
    server: { name: "Sketch Frenzy Backend", port: PORT, environment: NODE_ENV, status: "running" },
    game:   { phase: game.phase, round: game.round, players: players.size },
    connections: { socketClients: io.engine.clientsCount },
  });
});

app.post("/api/rooms", async (req, res) => {
  try {
    const clientIP = req.ip || req.socket.remoteAddress || "unknown";
    const hostId = `http_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const room = await assignRoom(hostId, clientIP, req.body as RoomCreateOptions);
    if (!room) {
      return res.status(503).json({ error: "No available rooms" });
    }
    
    // Auto-create new rooms if available count drops below threshold
    await autoCreateRoomsIfNeeded();
    
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.get("/", (_req, res) => res.send("Sketch Frenzy Server Running"));

connectRedis().catch((error) => {
  console.error("Failed to connect to Redis:", error);
});

server.listen(PORT, async () => {
  console.log(`\n⚡ Sketch Frenzy Server`);
  console.log(`├─ Running on:  http://localhost:${PORT}`);
  console.log(`├─ Frontend URL: ${CLIENT_URL}`);
  console.log(`└─ Environment:  ${NODE_ENV}`);
  
  // Pre-create available rooms
  await preCreateRooms(40);
  
  // Clean up any excess rooms from previous runs to maintain target
  await cleanupExcessRooms();
  
  const availableCount = await getAvailableRoomsCount();
  console.log(`├─ Available rooms: ${availableCount}`);
  console.log();
});