import { create } from "zustand";
import type { DrawingTool, Player, ChatMessage, GamePhase, ScoreDelta } from "@/types/drawing";

export const COLORS = [
  "#000000", "#3d3d3d", "#7f7f7f", "#ffffff",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4",
  "#a16207", "#fb923c", "#4ade80", "#60a5fa",
  "#c084fc", "#f472b6", "#fbbf24", "#34d399",
];

export interface DrawingStateStore {
  // ── Drawing tools ──────────────────────────────────────────────────────────
  tool: DrawingTool;
  color: string;
  brushSize: number;
  eraserSize: number;

  // ── Connection ─────────────────────────────────────────────────────────────
  connectedClients: number;
  isConnected: boolean;
  socketId: string | null;
  username: string;
  hostId: string | null;

  // ── Game core ──────────────────────────────────────────────────────────────
  players: Player[];
  chatMessages: ChatMessage[];
  wordHint: string;
  wordLengths: number[];
  currentWord: string | null;
  timeLeft: number;
  isDrawer: boolean;
  currentDrawerId: string | null;
  currentDrawerName: string;
  gamePhase: GamePhase;
  roundNumber: number;
  maxRounds: number;
  hasGuessedCorrectly: boolean;
  maxPlayers: number;

  // ── Word selection (drawer only) ───────────────────────────────────────────
  wordChoices: string[];
  isSelectingWord: boolean;
  wordSelectTimeLeft: number;

  // ── Round-end overlay ──────────────────────────────────────────────────────
  roundScoreDelta: ScoreDelta[];

  // ── Setters ────────────────────────────────────────────────────────────────
  setTool: (tool: DrawingTool) => void;
  setColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setEraserSize: (size: number) => void;
  setConnectedClients: (count: number) => void;
  setIsConnected: (connected: boolean) => void;
  setSocketId: (id: string | null) => void;
  setUsername: (name: string) => void;
  setHostId: (id: string | null) => void;
  setPlayers: (players: Player[]) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearChatMessages: () => void;
  setWordHint: (hint: string) => void;
  setWordLengths: (lengths: number[]) => void;
  setCurrentWord: (word: string | null) => void;
  setTimeLeft: (time: number) => void;
  setIsDrawer: (isDrawer: boolean) => void;
  setCurrentDrawerId: (id: string | null) => void;
  setCurrentDrawerName: (name: string) => void;
  setGamePhase: (phase: GamePhase) => void;
  setRoundNumber: (round: number) => void;
  setMaxRounds: (max: number) => void;
  setHasGuessedCorrectly: (has: boolean) => void;
  setMaxPlayers: (max: number) => void;
  setWordChoices: (choices: string[]) => void;
  setIsSelectingWord: (val: boolean) => void;
  setWordSelectTimeLeft: (t: number) => void;
  setRoundScoreDelta: (deltas: ScoreDelta[]) => void;

  /**
   * Resets all game state back to the "waiting for players" defaults.
   * Called when entering a new room so stale state from a previous room
   * (phase, scores, hints, chat) never bleeds into the new one.
   * Preserves: username, tool, color, brushSize, eraserSize, isConnected, socketId.
   */
  resetGameState: () => void;
}

export const useDrawingStore = create<DrawingStateStore>((set) => ({
  tool: "brush",
  color: "#000000",
  brushSize: 5,
  eraserSize: 20,
  connectedClients: 0,
  isConnected: false,
  socketId: null,
  username: "",
  hostId: null,

  players: [],
  chatMessages: [],
  wordHint: "",
  wordLengths: [],
  currentWord: null,
  timeLeft: 0,
  isDrawer: false,
  currentDrawerId: null,
  currentDrawerName: "",
  gamePhase: "waiting",
  roundNumber: 0,
  maxRounds: 3,
  hasGuessedCorrectly: false,
  maxPlayers: 8,

  wordChoices: [],
  isSelectingWord: false,
  wordSelectTimeLeft: 0,

  roundScoreDelta: [],
  roomError: null,

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setBrushSize: (size) => set({ brushSize: size }),
  setEraserSize: (size) => set({ eraserSize: size }),
  setConnectedClients: (count) => set({ connectedClients: count }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setSocketId: (id) => set({ socketId: id }),
  setUsername: (name) => set({ username: name }),
  setHostId: (id) => set({ hostId: id }),
  setPlayers: (players) => set({ players }),
  addChatMessage: (msg) =>
    set((state) => ({ chatMessages: [...state.chatMessages.slice(-199), msg] })),
  clearChatMessages: () => set({ chatMessages: [] }),
  setWordHint: (hint) => set({ wordHint: hint }),
  setWordLengths: (lengths) => set({ wordLengths: lengths }),
  setCurrentWord: (word) => set({ currentWord: word }),
  setTimeLeft: (time) => set({ timeLeft: time }),
  setIsDrawer: (isDrawer) => set({ isDrawer }),
  setCurrentDrawerId: (id) => set({ currentDrawerId: id }),
  setCurrentDrawerName: (name) => set({ currentDrawerName: name }),
  setGamePhase: (phase) => set({ gamePhase: phase }),
  setRoundNumber: (round) => set({ roundNumber: round }),
  setMaxRounds: (max) => set({ maxRounds: max }),
  setHasGuessedCorrectly: (has) => set({ hasGuessedCorrectly: has }),
  setMaxPlayers: (max) => set({ maxPlayers: max }),
  setWordChoices: (choices) => set({ wordChoices: choices }),
  setIsSelectingWord: (val) => set({ isSelectingWord: val }),
  setWordSelectTimeLeft: (t) => set({ wordSelectTimeLeft: t }),
  setRoundScoreDelta: (deltas) => set({ roundScoreDelta: deltas }),

  resetGameState: () =>
    set({
      // Clear all game-specific state so a new room always starts fresh
      players: [],
      chatMessages: [],
      wordHint: "",
      wordLengths: [],
      currentWord: null,
      timeLeft: 0,
      isDrawer: false,
      currentDrawerId: null,
      currentDrawerName: "",
      gamePhase: "waiting",
      roundNumber: 0,
      maxRounds: 3,
      hasGuessedCorrectly: false,
      maxPlayers: 8,
      wordChoices: [],
      isSelectingWord: false,
      wordSelectTimeLeft: 0,
      roundScoreDelta: [],
      hostId: null,
      connectedClients: 0,
      // username, tool, color, brushSize, eraserSize, socketId, isConnected are kept
    }),
}));