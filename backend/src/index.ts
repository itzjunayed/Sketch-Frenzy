import express from "express";
import http    from "http";
import { Server } from "socket.io";
import cors   from "cors";

const PORT       = process.env.PORT       || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const NODE_ENV   = process.env.NODE_ENV   || "development";

// ─── Word Dictionary ──────────────────────────────────────────────────────────
// Words are base64-encoded so they are not plaintext in source.
// The server decodes once at startup; the plain word is NEVER sent to
// non-drawer clients — guessers only receive the underscore hint.
const WORD_DICT_B64 =
  "WyJhcHBsZSIsImJhbmFuYSIsImNhdCIsImRvZyIsImhvdXNlIiwidHJlZSIsInN1biIsIm1v" +
  "b24iLCJzdGFyIiwiZmlzaCIsImJpcmQiLCJjYXIiLCJib29rIiwicGhvbmUiLCJjbG9jayIs" +
  "ImNoYWlyIiwidGFibGUiLCJkb29yIiwid2luZG93IiwiZmxvd2VyIiwiY2xvdWQiLCJyYWlu" +
  "Iiwic25vdyIsImZpcmUiLCJ3YXRlciIsImJvYXQiLCJ0cmFpbiIsInBsYW5lIiwicGl6emEi" +
  "LCJjYWtlIiwiaGF0Iiwic2hvZSIsImJhbGwiLCJraXRlIiwiZnJvZyIsImxpb24iLCJ0aWdl" +
  "ciIsImJlYXIiLCJyYWJiaXQiLCJkdWNrIiwiZWxlcGhhbnQiLCJndWl0YXIiLCJwaWFubyIs" +
  "ImRydW0iLCJjcm93biIsImZsYWciLCJoZWFydCIsImRpYW1vbmQiLCJyYWluYm93Iiwidm9s" +
  "Y2FubyIsImNhc3RsZSIsInJvYm90Iiwicm9ja2V0IiwicGVuZ3VpbiIsImJ1dHRlcmZseSIs" +
  "ImNhY3R1cyIsInR1cnRsZSIsIm9jdG9wdXMiLCJkcmFnb24iLCJ1bmljb3JuIiwid2l6YXJk" +
  "IiwicGlyYXRlIiwia25pZ2h0IiwibmluamEiLCJhc3Ryb25hdXQiLCJtZXJtYWlkIiwic2Fu" +
  "ZHdpY2giLCJ1bWJyZWxsYSIsImNhbWVyYSIsInRlbGVzY29wZSIsImJpY3ljbGUiLCJoZWxp" +
  "Y29wdGVyIiwic3VibWFyaW5lIiwibXVzaHJvb20iLCJwaW5lYXBwbGUiLCJicm9jY29saSIs" +
  "InRvcm5hZG8iLCJsaWdodGhvdXNlIiwiY29tcGFzcyIsInRyZWFzdXJlIiwibGFudGVybiIs" +
  "ImhhbW1lciIsInNjaXNzb3JzIiwiYmFja3BhY2siLCJub3RlYm9vayIsInN1bmZsb3dlciIs" +
  "InN0cmF3YmVycnkiLCJ3YXRlcm1lbG9uIiwicG9wY29ybiIsImhvdGRvZyIsImN1cGNha2Ui" +
  "LCJkb251dCIsInByZXR6ZWwiLCJzcGFnaGV0dGkiLCJ0YWNvIiwic3VzaGkiLCJpZ2xvbyIs" +
  "InB5cmFtaWQiLCJ2b2xjYW5vIiwiY2FjdHVzIiwiY2FueW9uIiwiaXNsYW5kIiwiZm9yZXN0" +
  "IiwiYmVhY2giLCJtb3VudGFpbiIsInJpdmVyIiwiYnJpZGdlIl0=";

const WORDS: string[] = JSON.parse(
  Buffer.from(WORD_DICT_B64, "base64").toString("utf-8")
);

console.log(`✓ Word dictionary loaded: ${WORDS.length} words`);

function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

/** Build the underscore hint shown to guessers: "apple" → "_ _ _ _ _" */
function buildHint(word: string): string {
  return word
    .split("")
    .map((c) => (c === " " ? "  " : "_"))
    .join(" ");
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ServerPlayer {
  id: string;
  username: string;
  score: number;
  hasGuessed: boolean;
  joinedAt: number;
}

type GamePhase = "waiting" | "starting" | "drawing" | "roundEnd" | "gameEnd";

interface GameState {
  phase: GamePhase;
  drawOrder: string[];          // socket IDs
  drawerIndex: number;
  currentWord: string | null;
  wordHint: string;
  timeLeft: number;
  round: number;
  maxRounds: number;
  roundStartTime: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  startTimeout: ReturnType<typeof setTimeout> | null;
  roundEndTimeout: ReturnType<typeof setTimeout> | null;
  usedWords: Set<string>;
}

// ─── State ────────────────────────────────────────────────────────────────────
const players = new Map<string, ServerPlayer>();
let drawHistory: any[] = [];

const game: GameState = {
  phase: "waiting",
  drawOrder: [],
  drawerIndex: 0,
  currentWord: null,
  wordHint: "",
  timeLeft: 60,
  round: 0,
  maxRounds: 3,
  roundStartTime: 0,
  timerInterval: null,
  startTimeout: null,
  roundEndTimeout: null,
  usedWords: new Set(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function playerList() {
  const arr = Array.from(players.values()).map((p) => ({
    id: p.id,
    username: p.username,
    score: p.score,
    hasGuessed: p.hasGuessed,
    isDrawing: game.drawOrder[game.drawerIndex] === p.id,
  }));
  return arr;
}

function clearTimers() {
  if (game.timerInterval)   { clearInterval(game.timerInterval);  game.timerInterval   = null; }
  if (game.startTimeout)    { clearTimeout(game.startTimeout);    game.startTimeout    = null; }
  if (game.roundEndTimeout) { clearTimeout(game.roundEndTimeout); game.roundEndTimeout = null; }
}

function allNonDrawersGuessed(): boolean {
  const drawerId = game.drawOrder[game.drawerIndex];
  for (const [id, p] of players) {
    if (id === drawerId) continue;
    if (!p.hasGuessed) return false;
  }
  return players.size > 1;
}

// ─── Express / Socket.IO ──────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: CLIENT_URL } });

// ─── Game logic ───────────────────────────────────────────────────────────────

function broadcastPlayerList() {
  io.emit("playerList", playerList());
}

function startCountdown() {
  if (game.phase !== "waiting") return;
  if (players.size < 2) {
    io.emit("waiting", { message: "⏳ Need at least 2 players to start." });
    return;
  }

  game.phase = "starting";
  io.emit("gamePhase", { phase: "starting", maxRounds: game.maxRounds });

  game.startTimeout = setTimeout(() => startRound(), 3000);
}

function startRound() {
  if (players.size < 2) {
    game.phase = "waiting";
    io.emit("gamePhase", { phase: "waiting" });
    io.emit("waiting", { message: "⏳ Not enough players. Waiting..." });
    return;
  }

  // Increment round or end game
  if (game.drawerIndex >= game.drawOrder.length) {
    game.round++;
    game.drawerIndex = 0;
    game.drawOrder = Array.from(players.keys()); // refresh order
  }

  if (game.round > game.maxRounds) {
    endGame();
    return;
  }

  // If first time starting
  if (game.round === 0) {
    game.round = 1;
    game.drawOrder = Array.from(players.keys());
  }

  const drawerId = game.drawOrder[game.drawerIndex];
  const drawer   = players.get(drawerId);

  if (!drawer) {
    // Player disconnected, skip
    game.drawerIndex++;
    startRound();
    return;
  }

  // Pick word (avoid repeats)
  let word = pickWord();
  let attempts = 0;
  while (game.usedWords.has(word) && attempts < 20) {
    word = pickWord();
    attempts++;
  }
  game.usedWords.add(word);

  // Reset guess state
  for (const p of players.values()) p.hasGuessed = false;

  game.currentWord  = word;
  game.wordHint     = buildHint(word);
  game.phase        = "drawing";
  game.timeLeft     = 60;
  game.roundStartTime = Date.now();

  // Clear canvas for new round
  drawHistory = [];
  io.emit("clear");

  const roundData = {
    round: game.round,
    drawerId,
    drawerUsername: drawer.username,
    wordHint: game.wordHint,
    timeLeft: game.timeLeft,
  };

  io.emit("roundStart", roundData);
  broadcastPlayerList();

  // Send actual word only to the drawer
  const drawerSocket = io.sockets.sockets.get(drawerId);
  if (drawerSocket) {
    drawerSocket.emit("yourWord", { word });
  }

  // Start countdown timer
  clearTimers();
  game.timerInterval = setInterval(() => {
    game.timeLeft--;
    io.emit("timerUpdate", { timeLeft: game.timeLeft });

    if (game.timeLeft <= 0) {
      endRound();
    }
  }, 1000);
}

function endRound() {
  if (game.phase !== "drawing") return;
  clearTimers();

  game.phase = "roundEnd";
  const word = game.currentWord ?? "";

  // Award drawer points: 20 per correct guesser
  const drawerId = game.drawOrder[game.drawerIndex];
  const drawer   = players.get(drawerId);
  if (drawer) {
    const correctCount = Array.from(players.values()).filter((p) => p.hasGuessed).length;
    drawer.score += correctCount * 20;
  }

  io.emit("roundEnd", { word, players: playerList() });
  broadcastPlayerList();

  game.drawerIndex++;

  // Pause before next round
  game.roundEndTimeout = setTimeout(() => {
    // Check if all drawers in this round have gone
    if (game.drawerIndex >= game.drawOrder.length) {
      if (game.round >= game.maxRounds) {
        endGame();
        return;
      }
    }
    startRound();
  }, 5000);
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

  // Reset game after 10 seconds
  setTimeout(() => resetGame(), 10000);
}

function resetGame() {
  clearTimers();
  game.phase        = "waiting";
  game.drawOrder    = [];
  game.drawerIndex  = 0;
  game.currentWord  = null;
  game.wordHint     = "";
  game.timeLeft     = 60;
  game.round        = 0;
  game.roundStartTime = 0;
  game.usedWords.clear();

  for (const p of players.values()) {
    p.score      = 0;
    p.hasGuessed = false;
  }

  drawHistory = [];
  io.emit("clear");
  io.emit("gamePhase", { phase: "waiting" });
  broadcastPlayerList();

  if (players.size >= 2) startCountdown();
}

// ─── Socket.IO connections ────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Send current state to new joiner
  socket.emit("clientCountUpdate", { count: io.engine.clientsCount });
  io.emit("clientCountUpdate",     { count: io.engine.clientsCount });

  // Replay draw history
  drawHistory.forEach((ev) => socket.emit("draw", ev));

  // ── Join game ──────────────────────────────────────────────────────────────
  socket.on("joinGame", ({ username }: { username: string }) => {
    const safeName = String(username ?? "").trim().slice(0, 20) || "Guest";

    // Update or create player
    if (!players.has(socket.id)) {
      players.set(socket.id, {
        id: socket.id,
        username: safeName,
        score: 0,
        hasGuessed: false,
        joinedAt: Date.now(),
      });
    } else {
      players.get(socket.id)!.username = safeName;
    }

    broadcastPlayerList();

    // If game is drawing, send current hint and who's drawing
    if (game.phase === "drawing") {
      const drawerId = game.drawOrder[game.drawerIndex];
      const drawer   = players.get(drawerId);
      socket.emit("roundStart", {
        round: game.round,
        drawerId,
        drawerUsername: drawer?.username ?? "",
        wordHint: game.wordHint,
        timeLeft: game.timeLeft,
      });
    }

    io.emit("waiting", { message: `👋 ${safeName} joined!` });
    io.emit("gamePhase", { phase: game.phase, maxRounds: game.maxRounds });

    // Start game if enough players
    if (game.phase === "waiting" && players.size >= 2) {
      startCountdown();
    }
  });

  // ── Draw ───────────────────────────────────────────────────────────────────
  socket.on("draw", (data) => {
    // Reject draw events from non-drawers
    if (game.phase === "drawing" && game.drawOrder[game.drawerIndex] !== socket.id) return;

    drawHistory.push(data);
    io.emit("draw", data);
  });

  // ── Undo ───────────────────────────────────────────────────────────────────
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

    if (!targetStrokeId) {
      socket.emit("fullRedraw", { history: drawHistory });
      return;
    }

    drawHistory = drawHistory.filter((ev) => ev.strokeId !== targetStrokeId);
    io.emit("fullRedraw", { history: drawHistory });
  });

  // ── Clear ──────────────────────────────────────────────────────────────────
  socket.on("clear", () => {
    if (game.phase === "drawing" && game.drawOrder[game.drawerIndex] !== socket.id) return;
    drawHistory = [];
    io.emit("clear");
  });

  // ── Guess / Chat ───────────────────────────────────────────────────────────
  socket.on("guess", ({ text }: { text: string }) => {
    const player = players.get(socket.id);
    if (!player) return;

    const safeTxt = String(text ?? "").trim().slice(0, 80);
    if (!safeTxt) return;

    // Drawer can't guess
    if (game.drawOrder[game.drawerIndex] === socket.id) return;

    // Already guessed
    if (player.hasGuessed) return;

    const isCorrect =
      game.phase === "drawing" &&
      game.currentWord !== null &&
      safeTxt.toLowerCase() === game.currentWord.toLowerCase();

    if (isCorrect) {
      // Calculate score — faster guess = more points
      const elapsed = (Date.now() - game.roundStartTime) / 1000;
      const points  = Math.max(50, Math.round(100 - elapsed * 0.7));

      player.score      += points;
      player.hasGuessed  = true;

      // Notify EVERYONE of the correct guess (but not the text itself)
      io.emit("correctGuess", {
        playerId: socket.id,
        username: player.username,
        points,
      });

      broadcastPlayerList();

      // If all non-drawers guessed, end round early
      if (allNonDrawersGuessed()) {
        endRound();
      }
    } else {
      // Regular chat message — broadcast to all
      const msg = {
        id:        `msg-${socket.id}-${Date.now()}`,
        playerId:  socket.id,
        username:  player.username,
        text:      safeTxt,
        type:      "chat" as const,
        timestamp: Date.now(),
      };
      io.emit("newChatMessage", msg);
    }
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    console.log("User disconnected:", socket.id, player?.username);

    if (player) {
      io.emit("waiting", { message: `👋 ${player.username} left.` });
    }

    players.delete(socket.id);
    io.emit("clientCountUpdate", { count: io.engine.clientsCount });
    broadcastPlayerList();

    // If the drawer disconnected, skip their turn
    if (
      game.phase === "drawing" &&
      game.drawOrder[game.drawerIndex] === socket.id
    ) {
      endRound();
    }

    // If fewer than 2 players, pause game
    if (players.size < 2 && (game.phase === "drawing" || game.phase === "starting")) {
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

  socket.on("getClientCount", () => {
    socket.emit("clientCountUpdate", { count: io.engine.clientsCount });
  });
});

// ─── HTTP endpoints ───────────────────────────────────────────────────────────
app.get("/api/status", (_req, res) => {
  res.json({
    server: { name: "Sketch Frenzy Backend", port: PORT, environment: NODE_ENV, status: "running" },
    game:   { phase: game.phase, round: game.round, players: players.size },
    connections: { socketClients: io.engine.clientsCount },
  });
});

app.get("/", (_req, res) => res.send("Sketch Frenzy Server Running"));

server.listen(PORT, () => {
  console.log(`\n⚡ Sketch Frenzy Server`);
  console.log(`├─ Running on: http://localhost:${PORT}`);
  console.log(`├─ Frontend URL: ${CLIENT_URL}`);
  console.log(`└─ Environment: ${NODE_ENV}\n`);
});