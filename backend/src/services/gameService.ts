import { Server } from "socket.io";
import { GAME_CONFIG } from "../config/gameConfig";
import { WORDS } from "../data/words";

export type GamePhase =
  | "waiting"
  | "starting"
  | "selectingWord"
  | "drawing"
  | "roundEnd"
  | "gameEnd";

interface PlayerInfo {
  socketId: string;
  username: string;
}

// ── Hint utilities ─────────────────────────────────────────────────────────────

function buildHintString(word: string, revealed: Set<number>): string {
  return [...word]
    .map((ch, i) => (ch === " " ? "  " : revealed.has(i) ? ch : "_"))
    .join(" ");
}

function getWordLengths(word: string): number[] {
  return word.split(" ").map((p) => p.length);
}

function pickRandomPosition(word: string, revealed: Set<number>): number | null {
  const candidates: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (word[i] !== " " && !revealed.has(i)) candidates.push(i);
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickWords(count: number, exclude: Set<string> = new Set()): string[] {
  const pool = WORDS.filter((w) => !exclude.has(w));
  const result: string[] = [];
  const used = new Set<number>();
  while (result.length < count && result.length < pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!used.has(idx)) { used.add(idx); result.push(pool[idx]); }
  }
  return result;
}

function calcGuesserScore(timeLeft: number, roundTime: number): number {
  return Math.max(50, Math.round(500 * (timeLeft / roundTime)));
}

// ── GameService ────────────────────────────────────────────────────────────────
//
// TURN ORDER MODEL
// ────────────────
// Every player draws ONCE per round for maxRounds rounds.
// Example: 3 players [A,B,C], 3 rounds → 9 total drawing turns:
//   turnOrder = [A, B, C,  A, B, C,  A, B, C]
//                ─────────  ─────────  ─────────
//                round 1    round 2    round 3
//
// • turnOrder is pre-built at game start and never mutated.
// • turnIndex advances through it; slots whose player has disconnected
//   are skipped silently inside nextDrawer().
// • playersPerRound is locked at start so the round counter stays stable
//   even when players leave.

export class GameService {
  private roomCode: string;
  private io: Server;
  private strokeBuffers: Map<string, any[]>;

  // Config (preserved across Play Again restarts)
  private maxRounds: number  = GAME_CONFIG.MAX_ROUNDS;
  private roundTime: number  = GAME_CONFIG.ROUND_TIME;
  private maxPlayers: number = 8;

  // Turn / round tracking
  private turnOrder: string[]   = [];   // pre-built draw sequence
  private turnIndex: number     = 0;    // next slot to consume
  private playersPerRound: number = 0;  // locked at start
  private currentDrawerId: string = ""; // socket ID of active drawer
  private currentDisplayRound: number = 0; // round shown in UI (1…maxRounds)

  // Runtime state
  private phase: GamePhase = "waiting";
  private playerInfos: Map<string, PlayerInfo> = new Map();
  private currentWord: string = "";
  private wordChoices: string[] = [];
  private wordHint: string = "";
  private wordLengths: number[] = [];
  private revealedPositions: Set<number> = new Set();
  private hintsRevealed: number = 0;
  private roundStartTime: number = 0;
  private scores: Map<string, number> = new Map();
  private roundScores: Map<string, number> = new Map();
  private guessedPlayers: Set<string> = new Set();
  private usedWords: Set<string> = new Set();

  // Timers
  private wordSelectTimer: NodeJS.Timeout | null = null;
  private tickInterval: NodeJS.Timeout | null = null;
  private hint1Timer: NodeJS.Timeout | null = null;
  private hint2Timer: NodeJS.Timeout | null = null;
  private roundEndTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;

  constructor(roomCode: string, io: Server, strokeBuffers: Map<string, any[]>) {
    this.roomCode = roomCode;
    this.io = io;
    this.strokeBuffers = strokeBuffers;
  }

  setConfig(rounds: number, roundTime: number, maxPlayers: number): void {
    this.maxRounds  = rounds    || GAME_CONFIG.MAX_ROUNDS;
    this.roundTime  = roundTime || GAME_CONFIG.ROUND_TIME;
    this.maxPlayers = maxPlayers || 8;
  }

  // ── Public getters ───────────────────────────────────────────────────────────

  getPhase(): GamePhase      { return this.phase; }
  getRound(): number         { return this.currentDisplayRound; }
  getMaxRounds(): number     { return this.maxRounds; }
  getWordHint(): string      { return this.wordHint; }
  getWordLengths(): number[] { return this.wordLengths; }
  getScore(sid: string): number { return this.scores.get(sid) ?? 0; }
  hasGuessed(sid: string): boolean { return this.guessedPlayers.has(sid); }
  isCurrentDrawer(sid: string): boolean { return this.currentDrawerId === sid; }
  getCurrentDrawerId(): string { return this.currentDrawerId; }
  getTimeLeft(): number {
    if (this.phase !== "drawing") return 0;
    const elapsed = Math.floor((Date.now() - this.roundStartTime) / 1000);
    return Math.max(0, this.roundTime - elapsed);
  }

  // ── Turn order helpers ───────────────────────────────────────────────────────

  /** Build the full sequence: every player once per round × maxRounds. */
  private buildTurnOrder(queue: string[]): string[] {
    const order: string[] = [];
    for (let r = 0; r < this.maxRounds; r++) {
      for (const sid of queue) order.push(sid);
    }
    return order;
  }

  /**
   * Advance turnIndex and return the next active drawer's socket ID.
   * Slots for disconnected players are skipped automatically.
   * Returns null when all turns are exhausted.
   */
  private nextDrawer(): string | null {
    while (this.turnIndex < this.turnOrder.length) {
      const sid = this.turnOrder[this.turnIndex];
      this.turnIndex++;
      if (this.playerInfos.has(sid)) return sid; // still connected
      // player left — skip this slot silently
    }
    return null;
  }

  /** Round number (1-based) for the turn that was just consumed. */
  private roundForConsumedIndex(): number {
    if (this.playersPerRound === 0) return 1;
    // turnIndex was incremented inside nextDrawer(), so subtract 1
    return Math.floor((this.turnIndex - 1) / this.playersPerRound) + 1;
  }

  // ── Game lifecycle ───────────────────────────────────────────────────────────

  /**
   * Start a brand-new game.
   * drawerQueue — socket IDs in join order; determines drawing rotation.
   * players     — full player info (must include all drawerQueue members).
   */
  start(drawerQueue: string[], players: PlayerInfo[]): void {
    this.playerInfos     = new Map(players.map((p) => [p.socketId, p]));
    this.scores          = new Map(players.map((p) => [p.socketId, 0]));
    this.usedWords       = new Set();
    this.turnOrder       = this.buildTurnOrder(drawerQueue);
    this.turnIndex       = 0;
    this.playersPerRound = drawerQueue.length;
    this.currentDrawerId = "";
    this.currentDisplayRound = 0;

    this.phase = "starting";
    this.io.to(this.roomCode).emit("gamePhase", {
      phase: "starting",
      maxRounds: this.maxRounds,
      round: 0,
    });

    this.countdownTimer = setTimeout(() => this.startTurn(), GAME_CONFIG.COUNTDOWN_DELAY_MS);
  }

  /**
   * Play Again — resets scores and round counter, keeps every player in
   * their seat. Emits only game-state events; never disconnects any socket.
   */
  restartGame(): void {
    if (this.phase !== "gameEnd") return;

    this.clearAllTimers();

    const players = [...this.playerInfos.values()];
    if (players.length === 0) { this.resetGame(); return; }

    // Rebuild turn order from whoever is still connected
    const queue = players.map((p) => p.socketId);

    this.turnOrder           = this.buildTurnOrder(queue);
    this.turnIndex           = 0;
    this.playersPerRound     = queue.length;
    this.currentDrawerId     = "";
    this.currentDisplayRound = 0;
    this.usedWords           = new Set();
    this.scores              = new Map(players.map((p) => [p.socketId, 0]));
    this.roundScores         = new Map();
    this.guessedPlayers      = new Set();
    this.currentWord         = "";
    this.wordHint            = "";
    this.wordLengths         = [];
    this.revealedPositions   = new Set();
    this.hintsRevealed       = 0;

    // Clear canvas
    this.strokeBuffers.set(this.roomCode, []);
    this.io.to(this.roomCode).emit("clear");

    // Tell every client to reset UI (no navigation, no disconnect)
    this.io.to(this.roomCode).emit("gameRestart");

    // Push zeroed scoreboard
    this.io.to(this.roomCode).emit("playerList", {
      players: this.buildPlayerList(),
      maxPlayers: this.maxPlayers,
    });

    // Kick off the starting countdown
    this.phase = "starting";
    this.io.to(this.roomCode).emit("gamePhase", {
      phase: "starting",
      maxRounds: this.maxRounds,
      round: 0,
    });

    this.countdownTimer = setTimeout(() => this.startTurn(), GAME_CONFIG.COUNTDOWN_DELAY_MS);
  }

  // ── Private: turn flow ───────────────────────────────────────────────────────

  /**
   * Start the next drawing turn.
   * Disconnected players' slots are skipped; when all slots are consumed
   * (or all remaining slots belong to disconnected players) endGame() is called.
   */
  private startTurn(): void {
    const drawerId = this.nextDrawer();

    if (!drawerId) {
      this.endGame();
      return;
    }

    this.currentDisplayRound = this.roundForConsumedIndex();
    this.currentDrawerId     = drawerId;

    const drawerInfo     = this.playerInfos.get(drawerId);
    const drawerUsername = drawerInfo?.username ?? "Unknown";

    // Per-turn reset
    this.guessedPlayers  = new Set([drawerId]); // drawer excluded from guessing
    this.roundScores     = new Map();
    this.wordChoices     = pickWords(GAME_CONFIG.WORD_CHOICES_COUNT, this.usedWords);
    this.revealedPositions = new Set();
    this.hintsRevealed   = 0;

    // Clear canvas for everyone
    this.strokeBuffers.set(this.roomCode, []);
    this.io.to(this.roomCode).emit("clear");

    // Broadcast: entering word-selection phase
    this.phase = "selectingWord";
    this.io.to(this.roomCode).emit("gamePhase", {
      phase: "selectingWord",
      maxRounds: this.maxRounds,
      round: this.currentDisplayRound,
      drawerUsername,
    });

    // Send word choices only to the active drawer
    this.io.to(drawerId).emit("wordChoices", {
      choices:      this.wordChoices,
      round:        this.currentDisplayRound,
      drawerUsername,
      wordSelectTime: GAME_CONFIG.WORD_SELECT_TIME,
    });

    // Auto-pick if the drawer times out
    this.wordSelectTimer = setTimeout(
      () => this.onWordSelected(drawerId, 0),
      GAME_CONFIG.WORD_SELECT_TIME * 1000
    );
  }

  selectWord(socketId: string, choiceIndex: number): void {
    if (!this.isCurrentDrawer(socketId)) return;
    if (this.phase !== "selectingWord")  return;
    const idx = Math.max(0, Math.min(choiceIndex, this.wordChoices.length - 1));
    this.onWordSelected(socketId, idx);
  }

  private onWordSelected(drawerId: string, choiceIndex: number): void {
    if (this.wordSelectTimer) { clearTimeout(this.wordSelectTimer); this.wordSelectTimer = null; }

    const word = this.wordChoices[choiceIndex] ?? this.wordChoices[0] ?? "cat";
    this.currentWord = word;
    this.usedWords.add(word);

    this.wordHint    = buildHintString(word, this.revealedPositions);
    this.wordLengths = getWordLengths(word);

    const drawerUsername = this.playerInfos.get(drawerId)?.username ?? "Unknown";

    this.phase          = "drawing";
    this.roundStartTime = Date.now();

    this.io.to(this.roomCode).emit("roundStart", {
      round:       this.currentDisplayRound,
      drawerId,
      drawerUsername,
      wordHint:    this.wordHint,
      wordLengths: this.wordLengths,
      timeLeft:    this.roundTime,
    });

    this.io.to(drawerId).emit("yourWord", { word });

    // Timer tick
    this.tickInterval = setInterval(() => {
      const tl = this.getTimeLeft();
      this.io.to(this.roomCode).emit("timerUpdate", { timeLeft: tl });
      if (tl <= 0) this.endRound("timeout");
    }, 1000);

    // Hint reveals
    const h1 = Math.floor(this.roundTime * 0.33) * 1000;
    const h2 = Math.floor(this.roundTime * 0.66) * 1000;
    this.hint1Timer = setTimeout(() => this.revealHint(), h1);
    if (GAME_CONFIG.MAX_HINT_REVEALS >= 2) {
      this.hint2Timer = setTimeout(() => this.revealHint(), h2);
    }
  }

  private revealHint(): void {
    if (this.phase !== "drawing")                           return;
    if (this.hintsRevealed >= GAME_CONFIG.MAX_HINT_REVEALS) return;
    const pos = pickRandomPosition(this.currentWord, this.revealedPositions);
    if (pos !== null) {
      this.revealedPositions.add(pos);
      this.hintsRevealed++;
      this.wordHint = buildHintString(this.currentWord, this.revealedPositions);
      this.io.to(this.roomCode).emit("hintUpdate", { wordHint: this.wordHint });
    }
  }

  handleGuess(socketId: string, username: string, text: string): void {
    if (this.phase !== "drawing")          return;
    if (this.guessedPlayers.has(socketId)) return;
    if (!text)                             return;

    const isCorrect = text.trim().toLowerCase() === this.currentWord.toLowerCase();

    if (isCorrect) {
      const pts = calcGuesserScore(this.getTimeLeft(), this.roundTime);
      this.scores.set(socketId, (this.scores.get(socketId) ?? 0) + pts);
      this.roundScores.set(socketId, pts);
      this.guessedPlayers.add(socketId);

      // Drawer earns a flat bonus per correct guess
      this.scores.set(
        this.currentDrawerId,
        (this.scores.get(this.currentDrawerId) ?? 0) + 50
      );

      this.io.to(this.roomCode).emit("correctGuess", { playerId: socketId, username, points: pts });

      // End turn early if every non-drawer has guessed
      const nonDrawers   = [...this.playerInfos.keys()].filter((id) => id !== this.currentDrawerId);
      const guessedCount = nonDrawers.filter((id) => this.guessedPlayers.has(id)).length;
      if (guessedCount >= nonDrawers.length) this.endRound("all_guessed");
    } else {
      this.io.to(this.roomCode).emit("newChatMessage", {
        id: `chat-${Date.now()}-${Math.random()}`,
        playerId: socketId, username, text,
        type: "chat", timestamp: Date.now(),
      });
    }
  }

  endRound(reason = "timeout"): void {
    if (this.phase === "roundEnd" || this.phase === "gameEnd") return;

    this.clearRoundTimers();
    this.phase = "roundEnd";

    const scoreDelta = [...this.playerInfos.entries()].map(([sid, info]) => ({
      id:       sid,
      username: info.username,
      delta:    this.roundScores.get(sid) ?? 0,
    }));

    this.io.to(this.roomCode).emit("roundEnd", {
      word:       this.currentWord,
      players:    this.buildPlayerList(),
      scoreDelta,
    });

    // startTurn() internally calls endGame() when all turns are exhausted
    this.roundEndTimer = setTimeout(
      () => this.startTurn(),
      GAME_CONFIG.ROUND_END_PAUSE_MS
    );
  }

  private endGame(): void {
    this.phase        = "gameEnd";
    const players     = this.buildPlayerList();
    const winner      = [...players].sort((a, b) => b.score - a.score)[0] ?? players[0];

    this.io.to(this.roomCode).emit("gameEnd", { winner, players });

    // 10-minute safety fallback if the host never clicks Play Again
    this.roundEndTimer = setTimeout(() => this.resetGame(), 10 * 60 * 1000);
  }

  private resetGame(): void {
    this.clearAllTimers();
    this.phase               = "waiting";
    this.turnOrder           = [];
    this.turnIndex           = 0;
    this.playersPerRound     = 0;
    this.currentDrawerId     = "";
    this.currentDisplayRound = 0;
    this.currentWord         = "";
    this.wordHint            = "";
    this.wordLengths         = [];
    this.scores              = new Map();
    this.guessedPlayers      = new Set();
    this.usedWords           = new Set();
    this.strokeBuffers.set(this.roomCode, []);

    this.io.to(this.roomCode).emit("gamePhase", { phase: "waiting" });
    this.io.to(this.roomCode).emit("clear");
    this.io.to(this.roomCode).emit("waiting", { message: "Game over! Waiting to start again…" });
  }

  /**
   * Called by the socket handler when a player disconnects.
   * The player's pre-built turnOrder slots are left in place; startTurn()
   * will skip them automatically via nextDrawer().
   *
   * If the departing player is the current drawer the server handler should
   * call game.endRound("drawer_left") immediately after this.
   */
  removePlayer(socketId: string): void {
    this.playerInfos.delete(socketId);
    this.scores.delete(socketId);
    this.guessedPlayers.delete(socketId);
    // turnOrder is NOT mutated — nextDrawer() handles the skip
  }

  stop(): void { this.clearAllTimers(); }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private buildPlayerList() {
    return [...this.playerInfos.entries()].map(([sid, info]) => ({
      id:         sid,
      username:   info.username,
      score:      this.scores.get(sid) ?? 0,
      hasGuessed: this.guessedPlayers.has(sid),
      isDrawing:  this.isCurrentDrawer(sid),
    }));
  }

  private clearRoundTimers(): void {
    if (this.tickInterval)    { clearInterval(this.tickInterval);   this.tickInterval    = null; }
    if (this.hint1Timer)      { clearTimeout(this.hint1Timer);      this.hint1Timer      = null; }
    if (this.hint2Timer)      { clearTimeout(this.hint2Timer);      this.hint2Timer      = null; }
    if (this.wordSelectTimer) { clearTimeout(this.wordSelectTimer); this.wordSelectTimer = null; }
  }

  private clearAllTimers(): void {
    this.clearRoundTimers();
    if (this.roundEndTimer)  { clearTimeout(this.roundEndTimer);  this.roundEndTimer  = null; }
    if (this.countdownTimer) { clearTimeout(this.countdownTimer); this.countdownTimer = null; }
  }
}