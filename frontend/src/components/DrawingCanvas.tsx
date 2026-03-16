import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import {
  Paintbrush, Droplet, RotateCcw, Trash2,
  Send, Eraser, ChevronRight,
} from "lucide-react";
import { useDrawingStore, COLORS } from "@/store/drawingStore";
import type { DrawingTool } from "@/types/drawing";

interface DrawingCanvasProps {
  socket: Socket | null;
}

const GAME_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');

  :root {
    --ink:        #1a1a2e;
    --paper:      #fffdf4;
    --gold:       #e3b65d;
    --gold-dark:  #c49430;
    --green:      #3db870;
    --green-dark: #2a9a57;
    --red:        #e85555;
    --blue:       #4a90d9;
    --cream:      #fdf6e3;
  }

  * { box-sizing: border-box; }

  .gf-root {
    font-family: 'Nunito', sans-serif;
    height: 100vh;
    display: grid;
    grid-template-rows: 58px 1fr;
    grid-template-columns: 240px 1fr 260px;
    background: #f0ebe0;
    overflow: hidden;
  }

  /* ── Top bar ── */
  .gf-topbar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--paper);
    border-bottom: 3px solid var(--ink);
    padding: 0 16px;
    gap: 12px;
    box-shadow: 0 3px 0 rgba(26,26,46,.12);
  }

  .gf-logo {
    font-family: 'Fredoka One', cursive;
    font-size: 1.4rem;
    color: var(--gold);
    text-shadow: 2px 2px 0 var(--ink), -1px -1px 0 var(--ink),
                 2px -1px 0 var(--ink), -1px 2px 0 var(--ink);
    white-space: nowrap;
    letter-spacing: 1px;
  }

  .gf-timer-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--cream);
    border: 2.5px solid var(--ink);
    border-radius: 10px;
    padding: 4px 14px;
    box-shadow: 3px 3px 0 var(--ink);
  }

  .gf-timer-num {
    font-family: 'Fredoka One', cursive;
    font-size: 1.5rem;
    min-width: 36px;
    text-align: center;
    line-height: 1;
  }

  .gf-timer-num.urgent { color: var(--red); animation: timerPulse .5s ease-in-out infinite alternate; }
  .gf-timer-num.ok     { color: var(--gold-dark); }
  .gf-timer-num.good   { color: var(--green-dark); }

  @keyframes timerPulse {
    from { transform: scale(1);    }
    to   { transform: scale(1.15); }
  }

  .gf-word-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--cream);
    border: 2.5px solid var(--ink);
    border-radius: 10px;
    padding: 4px 16px;
    box-shadow: 3px 3px 0 var(--ink);
    min-width: 0;
  }

  .gf-word-label {
    font-weight: 800;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #888;
    white-space: nowrap;
  }

  .gf-word-hint {
    font-family: 'Fredoka One', cursive;
    font-size: 1.2rem;
    letter-spacing: 6px;
    color: var(--ink);
    word-break: break-all;
  }

  .gf-word-drawing {
    font-family: 'Fredoka One', cursive;
    font-size: 1.1rem;
    color: var(--green-dark);
    letter-spacing: 2px;
  }

  .gf-round-badge {
    font-family: 'Fredoka One', cursive;
    font-size: 0.9rem;
    background: var(--gold);
    color: var(--ink);
    border: 2px solid var(--ink);
    border-radius: 8px;
    padding: 2px 10px;
    box-shadow: 2px 2px 0 var(--ink);
    white-space: nowrap;
  }

  .gf-conn {
    display: flex; align-items: center; gap: 5px;
    font-size: 0.75rem; font-weight: 700; white-space: nowrap;
  }
  .gf-conn-dot {
    width: 8px; height: 8px; border-radius: 50%;
    border: 1.5px solid var(--ink);
  }
  .gf-conn-dot.on  { background: var(--green); }
  .gf-conn-dot.off { background: var(--red); animation: blink 1s ease-in-out infinite; }

  @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:.3 } }

  /* ── Players panel (left) ── */
  .gf-players {
    background: rgba(255,253,244,.93);
    border-right: 3px solid var(--ink);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .gf-panel-title {
    font-family: 'Fredoka One', cursive;
    font-size: 1rem;
    padding: 10px 14px 8px;
    border-bottom: 2.5px solid var(--ink);
    background: var(--gold);
    color: var(--ink);
    letter-spacing: 1px;
    display: flex; align-items: center; gap: 6px;
  }

  .gf-player-list {
    overflow-y: auto;
    flex: 1;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .gf-player-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: var(--cream);
    border: 2px solid var(--ink);
    border-radius: 8px;
    box-shadow: 2px 2px 0 var(--ink);
    transition: transform .1s;
  }

  .gf-player-row.drawing {
    background: #d4edff;
    border-color: var(--blue);
    box-shadow: 2px 2px 0 var(--blue);
  }

  .gf-player-row.guessed {
    background: #d4f5e2;
    border-color: var(--green);
    box-shadow: 2px 2px 0 var(--green);
  }

  .gf-player-avatar {
    width: 28px; height: 28px;
    border-radius: 50%;
    background: var(--gold);
    border: 2px solid var(--ink);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Fredoka One', cursive;
    font-size: 0.8rem;
    color: var(--ink);
    flex-shrink: 0;
  }

  .gf-player-name {
    flex: 1;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gf-player-score {
    font-family: 'Fredoka One', cursive;
    font-size: 0.95rem;
    color: var(--blue);
  }

  .gf-player-status {
    font-size: 14px;
    flex-shrink: 0;
  }

  /* ── Canvas panel (center) ── */
  .gf-canvas-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #e8e2d4;
  }

  .gf-canvas-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    overflow: hidden;
  }

  .gf-canvas-container {
    position: relative;
    border: 3px solid var(--ink);
    box-shadow: 5px 5px 0 var(--ink);
    background: white;
    border-radius: 4px;
  }

  .gf-canvas-overlay {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,253,244,.85);
    border-radius: 2px;
    z-index: 10;
  }

  .gf-overlay-text {
    font-family: 'Fredoka One', cursive;
    font-size: 1.4rem;
    color: var(--ink);
    text-align: center;
    padding: 20px;
  }

  /* ── Toolbar ── */
  .gf-toolbar {
    border-top: 3px solid var(--ink);
    background: var(--paper);
    padding: 8px 12px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .gf-tool-btn {
    display: flex; align-items: center; justify-content: center; gap: 5px;
    padding: 5px 10px;
    font-family: 'Fredoka One', cursive;
    font-size: 0.85rem;
    letter-spacing: .3px;
    background: var(--cream);
    border: 2.5px solid var(--ink);
    border-radius: 7px;
    cursor: pointer;
    box-shadow: 2px 2px 0 var(--ink);
    transition: box-shadow .1s, transform .1s, background .1s;
    color: var(--ink);
    outline: none;
  }

  .gf-tool-btn:hover   { background: #f5edcf; transform: translate(-1px,-1px); box-shadow: 3px 3px 0 var(--ink); }
  .gf-tool-btn:active  { transform: translate(1px,1px); box-shadow: 1px 1px 0 var(--ink); }
  .gf-tool-btn.active  { background: var(--gold); }
  .gf-tool-btn.danger  { border-color: var(--red); color: var(--red); }
  .gf-tool-btn.danger:hover { background: #ffeaea; }
  .gf-tool-btn:disabled { opacity: .4; cursor: not-allowed; transform: none !important; }

  .gf-divider-v { width: 2px; height: 28px; background: var(--ink); opacity: .2; border-radius: 2px; }

  .gf-size-wrap {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.8rem; font-weight: 700; color: #666;
  }

  .gf-size-wrap input[type=range] {
    width: 80px; accent-color: var(--gold-dark);
  }

  .gf-color-grid {
    display: flex; flex-wrap: wrap; gap: 3px;
  }

  .gf-color-swatch {
    width: 22px; height: 22px;
    border: 2px solid var(--ink);
    border-radius: 4px;
    cursor: pointer;
    transition: transform .1s, box-shadow .1s;
    position: relative;
    outline: none;
  }

  .gf-color-swatch:hover   { transform: scale(1.15); box-shadow: 2px 2px 0 var(--ink); }
  .gf-color-swatch.selected { box-shadow: 0 0 0 2px white, 0 0 0 4px var(--ink); transform: scale(1.1); }

  /* ── Chat panel (right) ── */
  .gf-chat {
    background: rgba(255,253,244,.93);
    border-left: 3px solid var(--ink);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .gf-chat-msgs {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .gf-chat-msgs::-webkit-scrollbar { width: 5px; }
  .gf-chat-msgs::-webkit-scrollbar-track { background: transparent; }
  .gf-chat-msgs::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }

  .gf-msg {
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 0.8rem;
    line-height: 1.4;
    word-break: break-word;
    animation: msgIn .2s ease both;
  }

  @keyframes msgIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .gf-msg.chat   { background: var(--cream); border: 1.5px solid #e0d8c0; }
  .gf-msg.system { background: #f0f0f0; border: 1.5px solid #ccc; color: #555; font-style: italic; text-align: center; }
  .gf-msg.correct { background: #d4f5e2; border: 1.5px solid var(--green); font-weight: 700; text-align: center; }

  .gf-msg-author { font-weight: 800; color: var(--blue); margin-right: 4px; }
  .gf-msg-text   { color: var(--ink); }

  .gf-chat-input-wrap {
    border-top: 3px solid var(--ink);
    padding: 8px;
    display: flex;
    gap: 6px;
    background: var(--paper);
  }

  .gf-chat-input {
    flex: 1;
    padding: 7px 10px;
    font-family: 'Nunito', sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    background: var(--cream);
    border: 2.5px solid var(--ink);
    border-radius: 7px;
    outline: none;
    color: var(--ink);
    box-shadow: 2px 2px 0 var(--ink);
    transition: box-shadow .15s;
  }
  .gf-chat-input:focus { box-shadow: 3px 3px 0 var(--gold-dark); border-color: var(--gold-dark); }
  .gf-chat-input:disabled { opacity: .5; cursor: not-allowed; }

  .gf-chat-send {
    display: flex; align-items: center; justify-content: center;
    width: 36px; height: 36px;
    background: var(--green);
    border: 2.5px solid var(--ink);
    border-radius: 7px;
    cursor: pointer;
    box-shadow: 2px 2px 0 var(--ink);
    transition: box-shadow .1s, transform .1s, background .1s;
    flex-shrink: 0;
    color: white;
    outline: none;
  }
  .gf-chat-send:hover  { background: var(--green-dark); transform: translate(-1px,-1px); box-shadow: 3px 3px 0 var(--ink); }
  .gf-chat-send:active { transform: translate(1px,1px); box-shadow: 1px 1px 0 var(--ink); }
  .gf-chat-send:disabled { opacity: .4; cursor: not-allowed; transform: none !important; }

  /* ── Username overlay ── */
  .gf-username-overlay {
    position: fixed; inset: 0; z-index: 100;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,.5);
    backdrop-filter: blur(4px);
  }

  .gf-username-card {
    background: var(--paper);
    border: 3px solid var(--ink);
    border-radius: 12px;
    padding: 32px 28px;
    box-shadow: 8px 8px 0 var(--ink);
    width: 340px;
    position: relative;
    animation: cardIn .4s cubic-bezier(.34,1.56,.64,1) both;
  }
  @keyframes cardIn {
    from { opacity:0; transform: scale(.9) rotate(-2deg); }
    to   { opacity:1; transform: scale(1) rotate(0deg); }
  }

  .gf-username-card::before {
    content: '★'; position: absolute; top: -14px; left: -14px;
    font-size: 26px; color: var(--gold); text-shadow: 1px 1px 0 var(--ink);
    transform: rotate(-20deg); line-height: 1;
  }
  .gf-username-card::after {
    content: '★'; position: absolute; bottom: -14px; right: -14px;
    font-size: 26px; color: var(--gold); text-shadow: 1px 1px 0 var(--ink);
    transform: rotate(15deg); line-height: 1;
  }

  .gf-username-title {
    font-family: 'Fredoka One', cursive;
    font-size: 1.8rem;
    color: var(--gold);
    text-align: center;
    margin-bottom: 6px;
    text-shadow: 2px 2px 0 var(--ink), -1px -1px 0 var(--ink);
  }

  .gf-username-sub {
    text-align: center; font-size: .8rem; color: #888;
    font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
    margin-bottom: 20px;
  }

  .gf-username-input {
    width: 100%;
    padding: 10px 14px;
    font-family: 'Nunito', sans-serif;
    font-size: 1rem; font-weight: 700;
    background: var(--cream);
    border: 2.5px solid var(--ink);
    border-radius: 8px;
    outline: none;
    box-shadow: 3px 3px 0 var(--ink);
    color: var(--ink);
    margin-bottom: 14px;
    transition: box-shadow .15s, border-color .15s;
  }
  .gf-username-input:focus { box-shadow: 4px 4px 0 var(--gold-dark); border-color: var(--gold-dark); }

  .gf-username-btn {
    width: 100%;
    padding: 11px 20px;
    font-family: 'Fredoka One', cursive;
    font-size: 1.1rem;
    background: var(--green);
    color: white;
    border: 2.5px solid var(--ink);
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 4px 4px 0 var(--ink);
    transition: box-shadow .12s, transform .12s, background .12s;
    outline: none;
    text-shadow: 1px 1px 0 rgba(0,0,0,.3);
  }
  .gf-username-btn:hover  { background: var(--green-dark); transform: translate(-1px,-1px); box-shadow: 5px 5px 0 var(--ink); }
  .gf-username-btn:active { transform: translate(2px,2px); box-shadow: 2px 2px 0 var(--ink); }
  .gf-username-btn:disabled { opacity: .5; cursor: not-allowed; transform: none !important; }

  /* ── Game end / waiting overlay ── */
  .gf-phase-overlay {
    position: absolute; inset: 0; z-index: 20;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: rgba(255,253,244,.9);
    gap: 10px;
  }

  .gf-phase-title {
    font-family: 'Fredoka One', cursive;
    font-size: 2rem; color: var(--gold);
    text-shadow: 2px 2px 0 var(--ink), -1px -1px 0 var(--ink);
    text-align: center;
  }

  .gf-phase-sub {
    font-size: 1rem; font-weight: 700; color: #555;
    text-align: center;
  }
`;

export function DrawingCanvas({ socket }: DrawingCanvasProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const contextRef    = useRef<CanvasRenderingContext2D | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const chatEndRef    = useRef<HTMLDivElement>(null);

  const isDrawingRef  = useRef(false);
  const lastPointRef  = useRef<{ x: number; y: number } | null>(null);
  const strokeIdRef   = useRef<string>("");
  const myStrokeIdsRef= useRef<Set<string>>(new Set());

  const [canUndo,   setCanUndo  ] = useState(false);
  const [canvasSize,setCanvasSize] = useState(500);
  const [cursorPos, setCursorPos ] = useState<{ x: number; y: number } | null>(null);
  const [isOnCanvas,setIsOnCanvas] = useState(false);
  const [chatInput, setChatInput ] = useState("");
  const [localUsername, setLocalUsername] = useState("");

  const {
    color, brushSize, eraserSize, tool, isConnected,
    setTool, setColor, setBrushSize, setEraserSize,
    players, chatMessages, wordHint, currentWord,
    timeLeft, isDrawer, currentDrawerName, gamePhase,
    roundNumber, maxRounds, hasGuessedCorrectly,
    username, setUsername,
  } = useDrawingStore();

  // ── Username setup ─────────────────────────────────────────────────────────
  const showUsernameOverlay = !username;

  const handleJoin = () => {
    const name = localUsername.trim();
    if (!name) return;
    setUsername(name);
    localStorage.setItem("sf_username", name);
    if (socket) socket.emit("joinGame", { username: name });
  };

  // Load saved username
  useEffect(() => {
    const saved = localStorage.getItem("sf_username");
    if (saved) {
      setUsername(saved);
    }
  }, [setUsername]);

  // Emit joinGame when username is set and socket connects
  useEffect(() => {
    if (!socket || !username) return;
    if (socket.connected) {
      socket.emit("joinGame", { username });
    }
  }, [socket, username]);

  // ── Auto-scroll chat ───────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Canvas size from container ─────────────────────────────────────────────
  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;

    const updateSize = () => {
      const { width, height } = wrap.getBoundingClientRect();
      const size = Math.floor(Math.min(width - 24, height - 24));
      setCanvasSize(Math.max(size, 200));
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ── Canvas init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize <= 0) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Preserve content across resize
    let imageData: ImageData | null = null;
    if (contextRef.current && canvas.width > 0 && canvas.height > 0) {
      try { imageData = contextRef.current.getImageData(0, 0, canvas.width, canvas.height); } catch (_) {}
    }

    canvas.width  = canvasSize;
    canvas.height = canvasSize;
    ctx.lineCap  = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    if (imageData) {
      try { ctx.putImageData(imageData, 0, 0); } catch (_) {}
    }

    contextRef.current = ctx;
  }, [canvasSize]);

  // ── Drawing primitives ─────────────────────────────────────────────────────
  const paintSegment = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number },
     type: string, segColor: string, segSize: number) => {
      const ctx = contextRef.current;
      if (!ctx) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = type === "erase" ? "#FFFFFF" : segColor;
      ctx.lineWidth   = segSize;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }, []
  );

  const floodFill = useCallback(
    (startX: number, startY: number, fillColor: string) => {
      const canvas = canvasRef.current;
      const ctx    = contextRef.current;
      if (!canvas || !ctx) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;

      const sx = Math.round(startX), sy = Math.round(startY);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;

      const pi = (sy * width + sx) * 4;
      const [tR, tG, tB, tA] = [data[pi], data[pi+1], data[pi+2], data[pi+3]];
      const fR = parseInt(fillColor.slice(1,3),16);
      const fG = parseInt(fillColor.slice(3,5),16);
      const fB = parseInt(fillColor.slice(5,7),16);

      if (tR===fR && tG===fG && tB===fB && tA===255) return;

      const visited = new Uint8Array(width * height);
      const queue: number[] = [sx + sy * width];

      while (queue.length) {
        const flat = queue.pop()!;
        if (visited[flat]) continue;
        visited[flat] = 1;
        const x = flat % width, y = (flat/width)|0, idx = flat*4;

        if (data[idx]!==tR || data[idx+1]!==tG || data[idx+2]!==tB || data[idx+3]!==tA) continue;

        data[idx]=fR; data[idx+1]=fG; data[idx+2]=fB; data[idx+3]=255;

        if (x+1 < width)  queue.push(flat+1);
        if (x-1 >= 0)     queue.push(flat-1);
        if (y+1 < height) queue.push(flat+width);
        if (y-1 >= 0)     queue.push(flat-width);
      }
      ctx.putImageData(imageData, 0, 0);
    }, []
  );

  const applyDrawEvent = useCallback(
    (event: any) => {
      if (event.type === "stroke" || event.type === "erase") {
        paintSegment(
          { x: event.startX, y: event.startY },
          { x: event.endX,   y: event.endY   },
          event.type, event.color ?? "#000000", event.size ?? 5
        );
      } else if (event.type === "fill") {
        floodFill(event.x, event.y, event.color ?? "#000000");
      }
    }, [paintSegment, floodFill]
  );

  const replayHistory = useCallback(
    (history: any[]) => {
      const canvas = canvasRef.current, ctx = contextRef.current;
      if (!canvas || !ctx) return;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      history.forEach((ev) => applyDrawEvent(ev));
    }, [applyDrawEvent]
  );

  // ── Socket: drawing events ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleDraw = (event: any) => {
      if (event.clientId === socket.id) return;
      applyDrawEvent(event);
    };

    const handleFullRedraw = ({ history }: { history: any[] }) => {
      const serverIds = new Set(history.map((e: any) => e.strokeId).filter(Boolean));
      for (const id of myStrokeIdsRef.current) {
        if (!serverIds.has(id)) myStrokeIdsRef.current.delete(id);
      }
      setCanUndo(myStrokeIdsRef.current.size > 0);
      replayHistory(history);
    };

    const handleClear = () => {
      const canvas = canvasRef.current, ctx = contextRef.current;
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

  // ── Canvas coordinate helper ───────────────────────────────────────────────
  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top ) * (canvas.height / rect.height),
    };
  };

  const getCSSPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!socket || !isDrawer) return;
    const pt  = getCanvasPoint(e);
    const sid = `${socket.id}-${Date.now()}`;

    if (tool === "fill") {
      floodFill(pt.x, pt.y, color);
      socket.emit("draw", {
        type: "fill", x: pt.x, y: pt.y, color,
        timestamp: Date.now(), clientId: socket.id, strokeId: sid,
      });
      myStrokeIdsRef.current.add(sid);
      setCanUndo(true);
      return;
    }

    isDrawingRef.current  = true;
    lastPointRef.current  = pt;
    strokeIdRef.current   = sid;
    myStrokeIdsRef.current.add(sid);
    setCanUndo(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const css = getCSSPoint(e);
    setCursorPos(css);

    if (!isDrawingRef.current || !socket || !lastPointRef.current || !isDrawer) return;

    const pt       = getCanvasPoint(e);
    const isErase  = tool === "eraser";
    const segColor = isErase ? "#FFFFFF" : color;
    const segSize  = isErase ? eraserSize : brushSize;

    paintSegment(lastPointRef.current, pt, isErase ? "erase" : "stroke", segColor, segSize);

    socket.emit("draw", {
      type: isErase ? "erase" : "stroke",
      startX: lastPointRef.current.x, startY: lastPointRef.current.y,
      endX: pt.x, endY: pt.y,
      color: segColor, size: segSize,
      timestamp: Date.now(), clientId: socket.id,
      strokeId: strokeIdRef.current,
    });

    lastPointRef.current = pt;
  };

  const endStroke = () => {
    if (!isDrawingRef.current || !socket) return;
    socket.emit("draw", {
      type: tool === "eraser" ? "erase" : "stroke",
      strokeId: strokeIdRef.current, endStroke: true,
      timestamp: Date.now(), clientId: socket.id,
    });
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleMouseUp    = endStroke;
  const handleMouseLeave = () => { setIsOnCanvas(false); setCursorPos(null); endStroke(); };

  // ── Toolbar actions ────────────────────────────────────────────────────────
  const handleUndo = () => {
    if (!socket || !canUndo) return;
    socket.emit("undo", { clientId: socket.id });
    setCanUndo(false);
  };

  const handleClear = () => {
    if (!socket) return;
    socket.emit("clear");
  };

  // ── Chat / Guess ───────────────────────────────────────────────────────────
  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text || !socket || hasGuessedCorrectly) return;
    socket.emit("guess", { text, clientId: socket.id });
    setChatInput("");
  };

  const handleChatKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") sendChatMessage();
  };

  // ── Timer color ────────────────────────────────────────────────────────────
  const timerClass = timeLeft <= 10 ? "urgent" : timeLeft <= 20 ? "ok" : "good";
  const cursorSize = tool === "eraser" ? eraserSize : brushSize;
  const canDraw    = isDrawer && gamePhase === "drawing";

  // ── Rendering ──────────────────────────────────────────────────────────────
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GAME_STYLES }} />

      {/* Username overlay */}
      {showUsernameOverlay && (
        <div className="gf-username-overlay">
          <div className="gf-username-card">
            <div className="gf-username-title">Sketchy Frenzy</div>
            <div className="gf-username-sub">🖍 Draw • Guess • Win 🏆</div>
            <input
              className="gf-username-input"
              placeholder="Enter your name..."
              value={localUsername}
              onChange={(e) => setLocalUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              autoFocus
              maxLength={20}
            />
            <button
              className="gf-username-btn"
              onClick={handleJoin}
              disabled={!localUsername.trim()}
            >
              🚀 Join Game
            </button>
          </div>
        </div>
      )}

      <div className="gf-root">

        {/* ── Top bar ── */}
        <div className="gf-topbar">
          <div className="gf-logo">✏️ Sketchy Frenzy</div>

          {/* Timer */}
          {gamePhase === "drawing" && (
            <div className="gf-timer-wrap">
              <span style={{ fontSize: 16 }}>⏱</span>
              <span className={`gf-timer-num ${timerClass}`}>{timeLeft}</span>
              <span style={{ fontSize: 12, color: "#888", fontWeight: 700 }}>sec</span>
            </div>
          )}

          {/* Word hint / drawing word */}
          <div className="gf-word-wrap">
            {gamePhase === "drawing" ? (
              isDrawer && currentWord ? (
                <>
                  <span className="gf-word-label">🎨 Draw:</span>
                  <span className="gf-word-drawing">{currentWord.toUpperCase()}</span>
                </>
              ) : (
                <>
                  <span className="gf-word-label">Guess:</span>
                  <span className="gf-word-hint">{wordHint || "..."}</span>
                </>
              )
            ) : gamePhase === "roundEnd" ? (
              <>
                <span className="gf-word-label">Word was:</span>
                <span className="gf-word-drawing">{wordHint}</span>
              </>
            ) : (
              <span className="gf-word-label">
                {gamePhase === "waiting" ? "⏳ Waiting for players..." :
                 gamePhase === "starting" ? "🎮 Game starting..." :
                 gamePhase === "gameEnd"  ? "🏆 Game Over!" : ""}
              </span>
            )}
          </div>

          {/* Round badge */}
          {roundNumber > 0 && (
            <div className="gf-round-badge">
              Round {roundNumber}/{maxRounds}
            </div>
          )}

          {/* Connection */}
          <div className="gf-conn">
            <div className={`gf-conn-dot ${isConnected ? "on" : "off"}`} />
            <span style={{ color: isConnected ? "var(--green-dark)" : "var(--red)" }}>
              {isConnected ? "Connected" : "Offline"}
            </span>
          </div>
        </div>

        {/* ── Players panel ── */}
        <div className="gf-players">
          <div className="gf-panel-title">👥 Players</div>
          <div className="gf-player-list">
            {players.length === 0 ? (
              <div style={{ padding: "12px 8px", color: "#aaa", fontSize: "0.8rem", fontWeight: 700, textAlign: "center" }}>
                No players yet...
              </div>
            ) : (
              [...players]
                .sort((a, b) => b.score - a.score)
                .map((p, i) => (
                  <div
                    key={p.id}
                    className={`gf-player-row ${p.isDrawing ? "drawing" : ""} ${p.hasGuessed && !p.isDrawing ? "guessed" : ""}`}
                  >
                    <div className="gf-player-avatar">
                      {p.username[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="gf-player-name">{p.username}</div>
                    <div className="gf-player-score">{p.score}</div>
                    <div className="gf-player-status">
                      {p.isDrawing ? "🎨" : p.hasGuessed ? "✅" : i === 0 && gamePhase === "drawing" ? "👑" : ""}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* ── Canvas panel ── */}
        <div className="gf-canvas-panel">
          <div className="gf-canvas-wrap" ref={canvasWrapRef}>
            <div
              className="gf-canvas-container"
              style={{ width: canvasSize, height: canvasSize }}
            >
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onMouseEnter={() => setIsOnCanvas(true)}
                style={{
                  display: "block",
                  width: canvasSize, height: canvasSize,
                  cursor: canDraw ? "none" : "default",
                  borderRadius: 2,
                }}
              />

              {/* Cursor overlay */}
              {canDraw && isOnCanvas && cursorPos && (
                tool === "fill" ? (
                  <div className="pointer-events-none" style={{ position: "absolute", left: cursorPos.x, top: cursorPos.y }}>
                    <div style={{ position:"absolute",left:-0.75,top:-10,width:1.5,height:20,background:"#111",boxShadow:"0 0 0 0.5px #fff" }} />
                    <div style={{ position:"absolute",top:-0.75,left:-10,height:1.5,width:20,background:"#111",boxShadow:"0 0 0 0.5px #fff" }} />
                    <div style={{ position:"absolute",width:3,height:3,left:-1.5,top:-1.5,borderRadius:"50%",background:color,border:"1px solid #fff",boxShadow:"0 0 0 1px #111" }} />
                  </div>
                ) : (
                  <div className="pointer-events-none" style={{
                    position:"absolute",
                    width: Math.max(cursorSize,4), height: Math.max(cursorSize,4),
                    left: cursorPos.x - Math.max(cursorSize,4)/2,
                    top:  cursorPos.y - Math.max(cursorSize,4)/2,
                    borderRadius:"50%",
                    background: tool==="eraser" ? "rgba(200,200,200,.3)" : `${color}40`,
                    border: tool==="eraser" ? "1.5px dashed #888" : `1.5px solid ${color}`,
                  }} />
                )
              )}

              {/* Phase overlay on canvas */}
              {gamePhase === "waiting" && (
                <div className="gf-canvas-overlay">
                  <div className="gf-overlay-text">
                    ⏳<br/>Waiting for<br/>more players...
                  </div>
                </div>
              )}
              {gamePhase === "starting" && (
                <div className="gf-canvas-overlay">
                  <div className="gf-overlay-text">🎮<br/>Game starting!</div>
                </div>
              )}
              {gamePhase === "roundEnd" && (
                <div className="gf-canvas-overlay">
                  <div className="gf-overlay-text">
                    ⏰ Round over!<br/>
                    <span style={{ fontSize:"1rem", color:"var(--green-dark)" }}>
                      "{wordHint}"
                    </span>
                  </div>
                </div>
              )}
              {gamePhase === "gameEnd" && (
                <div className="gf-canvas-overlay">
                  <div className="gf-overlay-text">
                    🏆 Game Over!<br/>
                    <span style={{ fontSize:"1rem" }}>Check the scores!</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Drawing toolbar (only drawer sees it enabled) ── */}
          <div className="gf-toolbar">
            {/* Tool buttons */}
            <button
              className={`gf-tool-btn ${tool==="brush" ? "active" : ""}`}
              onClick={() => setTool("brush")}
              disabled={!canDraw}
              title="Brush"
            >
              <Paintbrush size={15} /> Brush
            </button>

            <button
              className={`gf-tool-btn ${tool==="fill" ? "active" : ""}`}
              onClick={() => setTool("fill")}
              disabled={!canDraw}
              title="Fill"
            >
              <Droplet size={15} /> Fill
            </button>

            <button
              className={`gf-tool-btn ${tool==="eraser" ? "active" : ""}`}
              onClick={() => setTool("eraser")}
              disabled={!canDraw}
              title="Eraser"
            >
              <Eraser size={15} /> Eraser
            </button>

            <div className="gf-divider-v" />

            {/* Size slider */}
            {tool !== "fill" && (
              <div className="gf-size-wrap">
                <span>{tool === "brush" ? "Size" : "Eraser"}:</span>
                <input
                  type="range" min="1" max="50"
                  value={tool === "brush" ? brushSize : eraserSize}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    tool === "brush" ? setBrushSize(v) : setEraserSize(v);
                  }}
                  disabled={!canDraw}
                />
                <span style={{ minWidth: 28, textAlign: "right" }}>
                  {tool === "brush" ? brushSize : eraserSize}px
                </span>
              </div>
            )}

            <div className="gf-divider-v" />

            {/* Color swatches */}
            <div className="gf-color-grid">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`gf-color-swatch ${color===c && tool!=="eraser" ? "selected" : ""}`}
                  style={{ background: c }}
                  title={c}
                  disabled={!canDraw}
                  onClick={() => {
                    setColor(c);
                    if (tool !== "brush" && tool !== "fill") setTool("brush");
                  }}
                />
              ))}
            </div>

            <div className="gf-divider-v" />

            {/* Undo / Clear */}
            <button
              className="gf-tool-btn"
              onClick={handleUndo}
              disabled={!canDraw || !canUndo}
              title="Undo"
            >
              <RotateCcw size={15} /> Undo
            </button>

            <button
              className="gf-tool-btn danger"
              onClick={handleClear}
              disabled={!canDraw}
              title="Clear canvas"
            >
              <Trash2 size={15} /> Clear
            </button>
          </div>
        </div>

        {/* ── Chat panel ── */}
        <div className="gf-chat">
          <div className="gf-panel-title">💬 Chat &amp; Guesses</div>

          <div className="gf-chat-msgs">
            {chatMessages.length === 0 && (
              <div style={{ padding: "12px 8px", color: "#aaa", fontSize: "0.78rem", fontWeight: 700, textAlign: "center" }}>
                Messages will appear here...
              </div>
            )}
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`gf-msg ${msg.type}`}>
                {msg.type === "chat" && (
                  <>
                    <span className="gf-msg-author">{msg.username}:</span>
                    <span className="gf-msg-text">{msg.text}</span>
                  </>
                )}
                {(msg.type === "system" || msg.type === "correct") && (
                  <span>{msg.text}</span>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="gf-chat-input-wrap">
            <input
              className="gf-chat-input"
              placeholder={
                isDrawer ? "You're drawing... 🎨" :
                hasGuessedCorrectly ? "You guessed it! ✅" :
                gamePhase !== "drawing" ? "Game not active..." :
                "Type your guess..."
              }
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKey}
              disabled={isDrawer || hasGuessedCorrectly || gamePhase !== "drawing"}
              maxLength={80}
            />
            <button
              className="gf-chat-send"
              onClick={sendChatMessage}
              disabled={isDrawer || hasGuessedCorrectly || gamePhase !== "drawing" || !chatInput.trim()}
              title="Send"
            >
              <Send size={15} />
            </button>
          </div>
        </div>

      </div>
    </>
  );
}

export default DrawingCanvas;