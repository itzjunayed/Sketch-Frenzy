import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Paintbrush, Droplet, RotateCcw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useDrawingStore, COLORS } from "@/store/drawingStore";
import type { DrawingTool } from "@/types/drawing";

interface DrawingCanvasProps {
  socket: Socket | null;
}

export function DrawingCanvas({ socket }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Drawing state
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokeIdRef = useRef<string>("");

  /**
   * strokeIds that belong to THIS client.
   * Used to determine if undo is available and to reconcile after fullRedraw.
   */
  const myStrokeIdsRef = useRef<Set<string>>(new Set());
  const [canUndo, setCanUndo] = useState(false);

  // Custom cursor overlay
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isOnCanvas, setIsOnCanvas] = useState(false);

  const {
    color, brushSize, eraserSize, tool,
    connectedClients, isConnected,
    setTool, setColor, setBrushSize, setEraserSize,
  } = useDrawingStore();

  const [canvasSize, setCanvasSize] = useState(600);

  // ─── Canvas init ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const computeSize = () =>
      Math.min(window.innerWidth - 80, window.innerHeight - 320, 800);

    const initCanvas = (size: number) => {
      canvas.width  = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.lineCap  = "round";
      ctx.lineJoin = "round";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, size, size);
      contextRef.current = ctx;
    };

    const size = computeSize();
    setCanvasSize(size);
    initCanvas(size);

    const handleResize = () => {
      const ctx = contextRef.current;
      if (!ctx || !canvas) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const newSize = computeSize();
      setCanvasSize(newSize);
      initCanvas(newSize);
      ctx.putImageData(imageData, 0, 0);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─── Drawing primitives ───────────────────────────────────────────────────────

  const paintSegment = useCallback(
    (
      from: { x: number; y: number },
      to:   { x: number; y: number },
      type: string,
      segColor: string,
      segSize: number
    ) => {
      const ctx = contextRef.current;
      if (!ctx) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = type === "erase" ? "#FFFFFF" : segColor;
      ctx.lineWidth   = segSize;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x,   to.y);
      ctx.stroke();
    },
    []
  );

  const floodFill = useCallback(
    (startX: number, startY: number, fillColor: string) => {
      const canvas = canvasRef.current;
      const ctx    = contextRef.current;
      if (!canvas || !ctx) return;

      const imageData  = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;

      const sx = Math.round(startX);
      const sy = Math.round(startY);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;

      const pi = (sy * width + sx) * 4;
      const tR = data[pi], tG = data[pi + 1], tB = data[pi + 2], tA = data[pi + 3];

      const fR = parseInt(fillColor.slice(1, 3), 16);
      const fG = parseInt(fillColor.slice(3, 5), 16);
      const fB = parseInt(fillColor.slice(5, 7), 16);

      if (tR === fR && tG === fG && tB === fB && tA === 255) return;

      const visited = new Uint8Array(width * height);
      const queue: number[] = [sx + sy * width];

      while (queue.length) {
        const flat = queue.pop()!;
        if (visited[flat]) continue;
        visited[flat] = 1;

        const x   = flat % width;
        const y   = (flat / width) | 0;
        const idx = flat * 4;

        if (
          data[idx]     !== tR || data[idx + 1] !== tG ||
          data[idx + 2] !== tB || data[idx + 3] !== tA
        ) continue;

        data[idx] = fR; data[idx + 1] = fG;
        data[idx + 2] = fB; data[idx + 3] = 255;

        if (x + 1 < width)  queue.push(flat + 1);
        if (x - 1 >= 0)     queue.push(flat - 1);
        if (y + 1 < height) queue.push(flat + width);
        if (y - 1 >= 0)     queue.push(flat - width);
      }

      ctx.putImageData(imageData, 0, 0);
    },
    []
  );

  /** Replay a single draw-event object onto the canvas. */
  const applyDrawEvent = useCallback(
    (event: any) => {
      if (event.type === "stroke" || event.type === "erase") {
        paintSegment(
          { x: event.startX, y: event.startY },
          { x: event.endX,   y: event.endY   },
          event.type,
          event.color ?? "#000000",
          event.size  ?? 5
        );
      } else if (event.type === "fill") {
        floodFill(event.x, event.y, event.color ?? "#000000");
      }
    },
    [paintSegment, floodFill]
  );

  /**
   * Clear the canvas and replay the authoritative history the server sent.
   * This is the single source of truth after any undo.
   */
  const replayHistory = useCallback(
    (history: any[]) => {
      const canvas = canvasRef.current;
      const ctx    = contextRef.current;
      if (!canvas || !ctx) return;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      history.forEach((ev) => applyDrawEvent(ev));
    },
    [applyDrawEvent]
  );

  // ─── Socket listeners ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    /** Incoming segment from another client — skip our own (painted locally). */
    const handleDraw = (event: any) => {
      if (event.clientId === socket.id) return;
      applyDrawEvent(event);
    };

    /**
     * fullRedraw — server sends the complete remaining history after an undo.
     * Every client wipes and replays, so all canvases end up identical.
     */
    const handleFullRedraw = ({ history }: { history: any[] }) => {
      // Reconcile: remove any of OUR strokeIds that the server removed
      const serverIds = new Set(
        history.map((e: any) => e.strokeId).filter(Boolean)
      );
      for (const id of myStrokeIdsRef.current) {
        if (!serverIds.has(id)) myStrokeIdsRef.current.delete(id);
      }
      setCanUndo(myStrokeIdsRef.current.size > 0);

      replayHistory(history);
    };

    /** clear — everyone resets to blank. */
    const handleClear = () => {
      const canvas = canvasRef.current;
      const ctx    = contextRef.current;
      if (!canvas || !ctx) return;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      myStrokeIdsRef.current.clear();
      setCanUndo(false);
    };

    socket.on("draw",       handleDraw);
    socket.on("fullRedraw", handleFullRedraw);
    socket.on("clear",      handleClear);

    return () => {
      socket.off("draw",       handleDraw);
      socket.off("fullRedraw", handleFullRedraw);
      socket.off("clear",      handleClear);
    };
  }, [socket, applyDrawEvent, replayHistory]);

  // ─── Coordinate helpers ───────────────────────────────────────────────────────

  const toCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  };

  const toCSSCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // ─── Emit helper ──────────────────────────────────────────────────────────────

  const emit = useCallback(
    (event: object) => {
      if (!socket) return;
      socket.emit("draw", {
        ...event,
        clientId:  socket.id ?? "unknown",
        timestamp: Date.now(),
      });
    },
    [socket]
  );

  // ─── Mouse handlers ───────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = toCanvasCoords(e);

    if (tool === "fill") {
      const sid = `${socket?.id ?? "local"}-${Date.now()}`;
      floodFill(x, y, color);              // paint locally immediately
      myStrokeIdsRef.current.add(sid);
      setCanUndo(true);
      emit({ type: "fill", x, y, color, strokeId: sid });
      return;
    }

    isDrawingRef.current = true;
    lastPointRef.current = { x, y };
    strokeIdRef.current  = `${socket?.id ?? "local"}-${Date.now()}`;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setCursorPos(toCSSCoords(e));

    if (!isDrawingRef.current || !lastPointRef.current) return;

    const from     = lastPointRef.current;
    const to       = toCanvasCoords(e);
    const segType  = tool === "eraser" ? "erase"    : "stroke";
    const segColor = tool === "brush"  ? color       : "#FFFFFF";
    const segSize  = tool === "brush"  ? brushSize   : eraserSize;

    paintSegment(from, to, segType, segColor, segSize);   // local (instant)

    emit({
      type: segType, startX: from.x, startY: from.y,
      endX: to.x,   endY:   to.y,
      color: segColor, size: segSize,
      strokeId: strokeIdRef.current,
    });

    lastPointRef.current = to;
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    finishStroke();
  };

  const handleMouseLeave = () => {
    setCursorPos(null);
    setIsOnCanvas(false);
    if (isDrawingRef.current) finishStroke();
  };

  const finishStroke = () => {
    if (!lastPointRef.current) return;

    const sid      = strokeIdRef.current;
    const segType  = tool === "eraser" ? "erase"  : "stroke";
    const segColor = tool === "brush"  ? color     : "#FFFFFF";
    const segSize  = tool === "brush"  ? brushSize : eraserSize;

    // Register this stroke as ours BEFORE emitting endStroke
    myStrokeIdsRef.current.add(sid);
    setCanUndo(true);

    emit({
      type: segType,
      startX: lastPointRef.current.x, startY: lastPointRef.current.y,
      endX:   lastPointRef.current.x, endY:   lastPointRef.current.y,
      color: segColor, size: segSize,
      strokeId: sid, endStroke: true,
    });

    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  // ─── Toolbar actions ──────────────────────────────────────────────────────────

  const handleUndo = () => {
    if (!socket || !canUndo) return;
    // Tell the server which client wants to undo.
    // Server will remove that client's last stroke and broadcast fullRedraw.
    socket.emit("undo", { clientId: socket.id });
    // Optimistically disable; re-enabled by fullRedraw if we still have strokes.
    setCanUndo(false);
  };

  const handleClear = () => {
    if (!socket) return;
    socket.emit("clear");
    // Local wipe handled by the "clear" socket event handler above.
  };

  const cursorSize = tool === "eraser" ? eraserSize : brushSize;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-6 p-6">

      {/* ── Status bar ── */}
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-600">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium text-red-600">Disconnected</span>
              </>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Connected Users</p>
            <p className="text-2xl font-bold text-blue-600">{connectedClients}</p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-4 space-y-4">

        {/* Tool selection */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Tools:</span>

          <Button
            variant={tool === "brush"  ? "default" : "outline"} size="sm"
            onClick={() => setTool("brush")}  className="gap-2"
          >
            <Paintbrush size={18} /> Brush
          </Button>

          <Button
            variant={tool === "fill"   ? "default" : "outline"} size="sm"
            onClick={() => setTool("fill")}   className="gap-2"
          >
            <Droplet size={18} /> Fill
          </Button>

          <Button
            variant={tool === "eraser" ? "default" : "outline"} size="sm"
            onClick={() => setTool("eraser")} className="gap-2"
          >
            <span className="inline-block h-4 w-4 rounded-sm border-2 border-current" />
            Eraser
          </Button>
        </div>

        <div className="h-px bg-border" />

        {/* Size slider — hidden for fill */}
        {tool !== "fill" && (
          <>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground min-w-fit">
                {tool === "brush" ? "Brush" : "Eraser"} Size:
              </span>
              <input
                type="range" min="1" max="50"
                value={tool === "brush" ? brushSize : eraserSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  tool === "brush" ? setBrushSize(v) : setEraserSize(v);
                }}
                className="flex-1"
              />
              <div
                className="shrink-0 rounded-full border border-border"
                style={{
                  width:  Math.min(cursorSize, 40),
                  height: Math.min(cursorSize, 40),
                  backgroundColor: tool === "eraser" ? "#e5e5e5" : color,
                }}
              />
              <span className="text-sm font-mono text-muted-foreground min-w-12">
                {cursorSize}px
              </span>
            </div>
            <div className="h-px bg-border" />
          </>
        )}

        {/* Color palette */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-muted-foreground">Colors:</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c} title={c}
                onClick={() => {
                  setColor(c);
                  if (tool !== "brush" && tool !== "fill") setTool("brush");
                }}
                className="relative h-9 w-9 rounded-lg border border-border transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
              >
                {color === c && tool === "brush" && (
                  <span className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-blue-500 ring-offset-1" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            onClick={handleUndo} disabled={!canUndo}
            className="gap-2"
          >
            <RotateCcw size={18} /> Undo
          </Button>
          <Button
            variant="destructive" size="sm"
            onClick={handleClear} className="gap-2"
          >
            <Trash2 size={18} /> Clear
          </Button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div
        className="relative rounded-lg border-2 border-border bg-white shadow-lg overflow-hidden"
        style={{ width: canvasSize, height: canvasSize }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={() => setIsOnCanvas(true)}
          className="h-full w-full rounded-lg bg-white"
          style={{ cursor: "none" }}
        />

        {/* ── Cursor overlay ── */}
        {isOnCanvas && cursorPos && (
          <>
            {tool === "fill" ? (
              /* Precision crosshair — no emoji */
              <div
                className="pointer-events-none absolute"
                style={{ left: cursorPos.x, top: cursorPos.y }}
              >
                {/* Vertical arm */}
                <div style={{
                  position: "absolute", left: -0.75, top: -10,
                  width: 1.5, height: 20,
                  backgroundColor: "#111", boxShadow: "0 0 0 0.5px #fff",
                }} />
                {/* Horizontal arm */}
                <div style={{
                  position: "absolute", top: -0.75, left: -10,
                  height: 1.5, width: 20,
                  backgroundColor: "#111", boxShadow: "0 0 0 0.5px #fff",
                }} />
                {/* Centre dot matches current fill colour */}
                <div style={{
                  position: "absolute", width: 3, height: 3,
                  left: -1.5, top: -1.5, borderRadius: "50%",
                  backgroundColor: color,
                  border: "1px solid #fff", boxShadow: "0 0 0 1px #111",
                }} />
              </div>
            ) : (
              /* Circle preview for brush / eraser */
              <div
                className="pointer-events-none absolute rounded-full"
                style={{
                  width:  Math.max(cursorSize, 4),
                  height: Math.max(cursorSize, 4),
                  left:   cursorPos.x - Math.max(cursorSize, 4) / 2,
                  top:    cursorPos.y - Math.max(cursorSize, 4) / 2,
                  backgroundColor: tool === "eraser"
                    ? "rgba(200,200,200,0.3)" : `${color}40`,
                  border: tool === "eraser"
                    ? "1.5px dashed #888" : `1.5px solid ${color}`,
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default DrawingCanvas;