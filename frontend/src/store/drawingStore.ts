import { create } from "zustand";
import type { DrawingTool } from "@/types/drawing";

export const COLORS = [
  "#000000", // Black
  "#FFFFFF", // White
  "#FF0000", // Red
  "#00FF00", // Green
  "#0000FF", // Blue
  "#FFFF00", // Yellow
  "#FF00FF", // Magenta
  "#00FFFF", // Cyan
  "#FFA500", // Orange
  "#800080", // Purple
];

export interface DrawingStateStore {
  tool: DrawingTool;
  color: string;
  brushSize: number;
  eraserSize: number;
  connectedClients: number;
  isConnected: boolean;
  socketId: string | null;

  setTool: (tool: DrawingTool) => void;
  setColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setEraserSize: (size: number) => void;
  setConnectedClients: (count: number) => void;
  setIsConnected: (connected: boolean) => void;
  setSocketId: (id: string | null) => void;
}

export const useDrawingStore = create<DrawingStateStore>((set) => ({
  tool: "brush",
  color: "#000000",
  brushSize: 5,
  eraserSize: 5,
  connectedClients: 0,
  isConnected: false,
  socketId: null,

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setBrushSize: (size) => set({ brushSize: size }),
  setEraserSize: (size) => set({ eraserSize: size }),
  setConnectedClients: (count) => set({ connectedClients: count }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setSocketId: (id) => set({ socketId: id }),
}))
