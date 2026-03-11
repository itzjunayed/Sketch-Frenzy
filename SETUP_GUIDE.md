# Sketch Frenzy - Setup Guide

This guide explains how to run Sketch Frenzy with all connected services (Backend, Frontend, and Redis).

## Architecture

The application consists of three main services:

1. **Backend** (Express.js + Socket.IO)
   - API server on Port 5000 (local) / 3001 (Docker)
   - Connects to Redis for session storage
   - Provides `/api/status` endpoint to show service connections

2. **Frontend** (React + Vite)
   - React app on Port 5173
   - Displays connection status and service URLs
   - Fetches backend status every 5 seconds

3. **Redis** (Cache)
   - Session storage and caching
   - Port 6379
   - Persistent data with AOF (Append Only File)

## Running with Docker (Recommended)

### Prerequisites
- Docker and Docker Compose installed

### Steps

1. **Build and start all services:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   - Frontend: [http://localhost:5173](http://localhost:5173)
   - Backend API: [http://localhost:3001](http://localhost:3001)
   - Redis: localhost:6379

3. **View logs:**
   ```bash
   # All services
   docker-compose logs -f

   # Specific service
   docker-compose logs -f backend
   docker-compose logs -f frontend
   docker-compose logs -f redis
   ```

4. **Stop services:**
   ```bash
   docker-compose down
   ```

## Running Locally (Without Docker)

### Prerequisites
- Node.js 20+
- Redis server running locally

### Step 1: Start Redis

**On Windows (using Windows Subsystem for Linux or pre-installed Redis):**
```bash
redis-server
```

**Or use Docker just for Redis:**
```bash
docker run -d --name sketch-redis -p 6379:6379 redis:7-alpine
```

### Step 2: Start Backend Server

```bash
cd backend
npm install
npm run dev
```

Expected output:
```
⚡ Sketch Frenzy Server
├─ Running on: http://localhost:5000
├─ Frontend URL: http://localhost:5173
├─ Redis: redis://localhost:6379
└─ Environment: development
```

### Step 3: Start Frontend (in a new terminal)

```bash
cd frontend
npm install
npm run dev
```

Expected output:
```
  VITE v7.2.4  ready in 123 ms

  ➜  Local:   http://localhost:5173/
```

### Step 4: View in Browser

Open [http://localhost:5173](http://localhost:5173) and you'll see all connected services displayed.

## Environment Files

### Backend (.env)
Located in `backend/.env`:
```
PORT=5000                      # Backend port (5000 for local, 3001 in Docker)
NODE_ENV=development           # development or production
REDIS_URL=redis://localhost:6379  # Redis connection URL
CLIENT_URL=http://localhost:5173  # Frontend URL for CORS
```

### Frontend (.env)
Located in `frontend/.env`:
```
VITE_BACKEND_URL=http://localhost:5000    # Backend API URL
VITE_SOCKET_URL=http://localhost:5000     # Socket.IO URL
```

## Service Status Display

The frontend automatically displays:

- **Backend Status**: Server name, port, environment, and status
- **Redis Status**: Connection URL and connection status
- **Frontend Status**: Current location and status
- **Active Connections**: Number of connected WebSocket clients

The status updates every 5 seconds, showing real-time connection information.

## Docker Network

When running with Docker Compose:
- All services communicate over `sketch-frenzy-network` bridge network
- Service discovery is automatic (e.g., `redis:6379` resolves to the Redis container)
- Frontend communicates with backend using the service name: `http://backend:3001`

## Troubleshooting

### Backend can't connect to Redis
- **Error**: `Redis connection error`
- **Solution**: 
  - Check Redis is running: `redis-cli ping` should return `PONG`
  - Verify `REDIS_URL` in `.env` matches your Redis location

### Frontend can't connect to Backend
- **Error**: `Failed to fetch backend status`
- **Solution**:
  - Check backend is running on the correct port
  - Verify `VITE_BACKEND_URL` in frontend `.env` matches backend URL
  - Check browser console for CORS errors

### Port already in use
- **Solution**: 
  - Change port in `.env` files or environment variables
  - Or kill the process using the port

### Docker container won't start
- **Solution**:
  ```bash
  # Remove containers and volumes
  docker-compose down -v
  
  # Rebuild everything
  docker-compose up --build
  ```

## Testing the Connection

### Using curl (Backend API)
```bash
# Check backend status
curl http://localhost:5000/api/status
```

Response example:
```json
{
  "server": {
    "name": "Sketch Frenzy Backend",
    "port": 5000,
    "environment": "development",
    "status": "running"
  },
  "redis": {
    "url": "redis://localhost:6379",
    "connected": true,
    "status": "connected"
  },
  "frontend": {
    "url": "http://localhost:5173"
  },
  "connections": {
    "socketClients": 0
  }
}
```

### Using Redis CLI
```bash
# Test Redis connection
redis-cli ping
# Should respond with: PONG

# Check Redis is running
redis-cli info server
```

## Development Workflow

1. **Make changes to any service** - they'll hot-reload thanks to nodemon and Vite
2. **Check the frontend** to see the live status updates
3. **Check logs** if something isn't working: `docker-compose logs -f service-name`

## Next Steps

- Add real API endpoints to the backend
- Implement WebSocket events for real-time communication
- Add Redis operations (storing/retrieving session data)
- Deploy to production (update environment variables and use production builds)
