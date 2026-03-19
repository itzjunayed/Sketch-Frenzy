export type DrawingTool = "brush" | "eraser" | "fill";

export type GamePhase =
  | "waiting"
  | "starting"
  | "selectingWord"   // drawer is picking a word
  | "drawing"
  | "roundEnd"
  | "gameEnd";

export interface DrawingState {
  color: string;
  brushSize: number;
}

export interface DrawEvent {
  type: "stroke" | "erase" | "fill" | "clear" | "undo";
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  x?: number;
  y?: number;
  color?: string;
  size?: number;
  timestamp: number;
  clientId: string;
  strokeId?: string;
  tool?: DrawingTool;
  endStroke?: boolean;
}

export interface StrokePoint {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  username: string;
  score: number;
  hasGuessed: boolean;
  isDrawing: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  text: string;
  type: "chat" | "system" | "correct";
  timestamp: number;
}

/** Points gained by each player in the most recent round */
export interface ScoreDelta {
  id: string;
  username: string;
  delta: number;
}