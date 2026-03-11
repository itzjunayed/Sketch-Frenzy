export type DrawingTool = "brush" | "eraser" | "fill";

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
  color?: string;
  size?: number;
  timestamp: number;
  clientId: string;
  tool?: DrawingTool;
}

export interface StrokePoint {
  x: number;
  y: number;
}
