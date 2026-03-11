import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { createClient } from "redis";

const PORT      = process.env.PORT       || 5000;
const REDIS_URL = process.env.REDIS_URL  || "redis://localhost:6379";
const CLIENT_URL= process.env.CLIENT_URL || "http://localhost:5173";
const NODE_ENV  = process.env.NODE_ENV   || "development";

// ─── Redis ────────────────────────────────────────────────────────────────────
let redisClient = createClient({ url: REDIS_URL });
let isRedisConnected = false;

redisClient.on("connect", () => { console.log("✓ Redis connected:", REDIS_URL); isRedisConnected = true; });
redisClient.on("error",   (err: { message: any }) => { console.error("✗ Redis error:", err.message); isRedisConnected = false; });
redisClient.connect().catch((err: { message: any }) => console.error("Redis connect failed:", err.message));

// ─── Express / Socket.IO ──────────────────────────────────────────────────────
const app    = express();
app.use(cors({ origin: CLIENT_URL }));

const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: CLIENT_URL } });

/**
 * drawHistory is the single source of truth for the canvas state.
 *
 * Every draw event has:
 *   clientId  — who drew it
 *   strokeId  — groups all segments of one brush stroke (or one fill)
 *
 * On undo we remove ALL events that share the strokeId of the requesting
 * client's most recent stroke, then broadcast the remaining history so
 * every client replays from scratch. This guarantees all canvases are
 * pixel-identical and late joiners always get the correct state.
 */
let drawHistory: any[] = [];

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  const clientCount = io.engine.clientsCount;
  socket.emit("clientCountUpdate", { count: clientCount });
  io.emit("clientCountUpdate",     { count: clientCount });

  // ── Replay current state for the late joiner ─────────────────────────────
  console.log(`Replaying ${drawHistory.length} events to ${socket.id}`);
  drawHistory.forEach((ev) => socket.emit("draw", ev));

  // ── Draw ──────────────────────────────────────────────────────────────────
  socket.on("draw", (data) => {
    drawHistory.push(data);
    io.emit("draw", data);           // broadcast to ALL (including sender)
  });

  // ── Undo — per-user, server-authoritative ─────────────────────────────────
  socket.on("undo", ({ clientId }: { clientId: string }) => {
    // Find the most recent strokeId that belongs to this client
    let targetStrokeId: string | null = null;

    for (let i = drawHistory.length - 1; i >= 0; i--) {
      const ev = drawHistory[i];
      if (ev.clientId !== clientId) continue;

      if (ev.strokeId) {
        targetStrokeId = ev.strokeId;
        break;
      }

      // Event has no strokeId (shouldn't happen with new client, but guard it):
      // remove just this single event and broadcast immediately
      drawHistory.splice(i, 1);
      io.emit("fullRedraw", { history: drawHistory });
      return;
    }

    if (!targetStrokeId) {
      // Nothing left to undo for this client — send fullRedraw anyway so the
      // client can reconcile its canUndo state correctly
      socket.emit("fullRedraw", { history: drawHistory });
      return;
    }

    // Remove every segment that belongs to the target stroke
    drawHistory = drawHistory.filter((ev) => ev.strokeId !== targetStrokeId);

    // Broadcast the authoritative remaining history to EVERYONE.
    // Each client will clear its canvas and replay these events.
    io.emit("fullRedraw", { history: drawHistory });
  });

  // ── Clear ─────────────────────────────────────────────────────────────────
  socket.on("clear", () => {
    drawHistory = [];
    io.emit("clear");
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    const count = io.engine.clientsCount;
    io.emit("clientCountUpdate", { count });
  });

  socket.on("getClientCount", () => {
    socket.emit("clientCountUpdate", { count: io.engine.clientsCount });
  });
});

// ─── HTTP endpoints ───────────────────────────────────────────────────────────
app.get("/api/status", (_req, res) => {
  res.json({
    server: { name: "Sketch Frenzy Backend", port: PORT, environment: NODE_ENV, status: "running" },
    redis:  { url: REDIS_URL, connected: isRedisConnected, status: isRedisConnected ? "connected" : "disconnected" },
    frontend: { url: CLIENT_URL },
    connections: { socketClients: io.engine.clientsCount },
  });
});

app.get("/", (_req, res) => res.send("Sketch Frenzy Server Running"));

server.listen(PORT, () => {
  console.log(`\n⚡ Sketch Frenzy Server`);
  console.log(`├─ Running on: http://localhost:${PORT}`);
  console.log(`├─ Frontend URL: ${CLIENT_URL}`);
  console.log(`├─ Redis: ${REDIS_URL}`);
  console.log(`└─ Environment: ${NODE_ENV}\n`);
});