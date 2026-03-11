import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { createClient } from "redis";

// Configuration
const PORT = process.env.PORT || 5000;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const NODE_ENV = process.env.NODE_ENV || "development";

// Redis client
let redisClient = createClient({
  url: REDIS_URL,
});

let isRedisConnected = false;

redisClient.on("connect", () => {
  console.log("✓ Redis connected:", REDIS_URL);
  isRedisConnected = true;
});

redisClient.on("error", (err: { message: any; }) => {
  console.error("✗ Redis connection error:", err.message);
  isRedisConnected = false;
});

// Connect to Redis
redisClient.connect().catch((err: { message: any; }) => {
  console.error("Failed to connect to Redis:", err.message);
});

// Express setup
const app = express();
app.use(
  cors({
    origin: CLIENT_URL,
  })
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// Health/Status endpoint
app.get("/api/status", (req, res) => {
  res.json({
    server: {
      name: "Sketch Frenzy Backend",
      port: PORT,
      environment: NODE_ENV,
      status: "running",
    },
    redis: {
      url: REDIS_URL,
      connected: isRedisConnected,
      status: isRedisConnected ? "connected" : "disconnected",
    },
    frontend: {
      url: CLIENT_URL,
    },
    connections: {
      socketClients: io.engine.clientsCount,
    },
  });
});

app.get("/", (req, res) => {
  res.send("Sketch Frenzy Server Running");
});

server.listen(PORT, () => {
  console.log(`\n⚡ Sketch Frenzy Server`);
  console.log(`├─ Running on: http://localhost:${PORT}`);
  console.log(`├─ Frontend URL: ${CLIENT_URL}`);
  console.log(`├─ Redis: ${REDIS_URL}`);
  console.log(`└─ Environment: ${NODE_ENV}\n`);
});