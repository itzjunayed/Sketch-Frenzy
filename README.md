# Sketch Frenzy

> 🎨 A real-time multiplayer drawing guessing game where players compete to draw and guess words.

## Features

- **Real-Time Multiplayer Gaming** - Play with up to 8 players
- **Live Drawing Canvas** - Smooth drawing with brush, eraser, and color picker
- **Real-Time Chat** - Guess words instantly, see reactions live
- **Scoring System** - Earn points for speed and accuracy
- **Smart Word Selection** - Customizable rounds, time limits, and player counts
- **Player Statistics** - Track scores across multiple games


## Table of Contents

- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Running Locally](#running-locally)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Architecture](#architecture)

## Tech Stack

### Frontend
- **React 18** - UI library
- **Vite** - Fast build tool and dev server
- **TypeScript** - Type-safe JavaScript
- **Zustand** - Lightweight state management
- **Socket.IO Client** - Real-time communication
- **TailwindCSS** - Utility-first CSS
- **React Router** - Client-side routing

### Backend
- **Node.js 20** - JavaScript runtime
- **Express** - Web framework
- **Socket.IO** - WebSocket server
- **TypeScript** - Type-safe JavaScript
- **nodemon** - Development auto-reload

### Databases
- **PostgreSQL** - Persistent data storage
- **Redis** - Session and cache storage

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration

## Installation

### Prerequisites

- **Node.js 20+** and npm
- **Docker** and Docker Compose (for containerized setup)
- **PostgreSQL 15+** (if running without Docker)
- **Redis 7+** (if running without Docker)

### Clone Repository

```bash
git clone https://github.com/yourusername/sketch-frenzy.git
cd sketch-frenzy
```

### Install Dependencies

```bash
# Frontend dependencies
cd frontend && npm install

# Backend dependencies
cd backend && npm install
```

## Running Locally

### Option 1: Docker (Recommended)

```bash
# Start all services
docker compose up --build -d

# Access application
# Frontend: http://localhost:5173
# Backend API: http://localhost:5000

# View logs
docker compose logs -f

# Stop services
docker compose stop
```

### Option 2: Manual Setup

**Terminal 1 - Backend:**
```bash
cd backend
npm install
npm run dev
# Server runs on http://localhost:5000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:5173
```

**Requirements:**
- PostgreSQL running on localhost:5432
- Redis running on localhost:6379

## Project Structure

```
sketch-frenzy/
├── backend/                          # Node.js + Express server
│   ├── src/
│   │   ├── index.ts                 # Main server & Socket.IO handlers
│   │   ├── config/
│   │   │   └── gameConfig.ts        # Game settings
│   │   ├── data/
│   │   │   └── words.ts             # Word list for drawing
│   │   ├── db/
│   │   │   ├── postgres.ts          # Database connection
│   │   │   └── schema.sql           # Database schema
│   │   └── services/
│   │       ├── gameService.ts       # Game logic
│   │       └── roomService.ts       # Room management
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── frontend/                         # React + Vite application
│   ├── src/
│   │   ├── App.tsx                  # Main app router
│   │   ├── main.tsx                 # Entry point
│   │   ├── components/
│   │   │   └── DrawingCanvas.tsx    # Game interface
│   │   ├── pages/
│   │   │   ├── home/                # Join/Create room
│   │   │   └── canvas/              # Game page
│   │   ├── store/
│   │   │   └── drawingStore.ts      # Global state
│   │   ├── hooks/
│   │   │   └── useSocket.ts         # Socket.IO hook
│   │   ├── services/                # Core logic
│   │   ├── types/
│   │   │   └── drawing.ts           # TypeScript types
│   │   └── config/
│   │       └── gameConfig.ts        # Game constants
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── Dockerfile
│
├── docker-compose.yml               # Services orchestration
└── README.md                         # This file
```

## How to Play

### Creating a Game

1. Enter your username
2. Set game settings:
   - **Max Players**: 2-12 players
   - **Rounds**: 1-10 rounds per game
   - **Draw Time**: 60/90/120 seconds per round
3. Click **Create Game**
4. Share the room code with friends

### Joining a Game

1. Enter room code (from host)
2. Enter your username
3. Click **Join**
4. Wait for host to start the game

### Playing

1. **Drawer's Turn**:
   - Pick your word from 3 options (15 sec)
   - Draw to help others guess (80 sec)
   - Reveal letters to help guessers

2. **Guesser's Turn**:
   - Watch the drawing
   - Look for hints (letters revealed)
   - Type your guess in the chat
   - Correct guesses get points

3. **Scoring**:
   - Drawer: +100 base + +50 per correct guesser
   - Guesser: 50-500 based on speed

4. **End Game**:
   - Final standings after all rounds
   - Highest score wins!

## Configuration

### Game Settings

Edit `GAME_CONFIG` in `backend/src/config/gameConfig.ts`:

```typescript
export const GAME_CONFIG = {
  WORD_CHOICES_COUNT: 3,            // Words shown to drawer
  WORD_SELECT_TIME: 15,             // Seconds to pick word
  MAX_HINT_REVEALS: 2,              // Max hints per round
  MIN_PLAYERS: 2,                   // Minimum to start
};
```

### Environment Variables

**Backend** (`.env` or Docker environment):
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sketchfrenzy
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:5173
```

**Frontend** (`.env` or Docker environment):
```env
VITE_BACKEND_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

## Architecture

### System Overview

```
┌─ Frontend (React + Vite) ──────────────────┐
│  • Pages: Home, Canvas                     │
│  • State: Zustand store                    │
│  • Realtime: Socket.IO client              │
└─────────────────┬──────────────────────────┘
                  │ WebSocket
┌─────────────────▼──────────────────────────┐
│  Backend (Express + Socket.IO)             │
│  • Room management (Redis)                 │
│  • Game logic (GameService)                │
│  • API endpoints (/health, etc)            │
└─────────────────┬───────────┬──────────────┘
                  │           │
        ┌─────────▼─┐  ┌──────▼────┐
        │ PostgreSQL│  │   Redis   │
        │  (Data)   │  │ (Cache)   │
        └───────────┘  └───────────┘
```

### Data Flow

1. **User Action** → Frontend component
2. **Socket Event** → Backend handler
3. **Business Logic** → GameService / RoomService
4. **Database Query** → PostgreSQL / Redis
5. **Response Event** → Broadcast to clients
6. **State Update** → Zustand store
7. **UI Render** → React components

## Database Schema

### Core Tables

- **users** - Player profiles
- **rooms** - Game rooms
- **room_players** - Player room memberships
- **rounds** - Round history
- **guesses** - Guess history

See [schema.sql](./backend/src/db/schema.sql) for full details.