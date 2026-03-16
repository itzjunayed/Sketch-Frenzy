import { useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { useDrawingStore } from "@/store/drawingStore";
import Home from "./pages/home/page";
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";

export function App() {
  const socket = useSocket();
  const { setConnectedClients, setIsConnected, setSocketId } = useDrawingStore();

  useEffect(() => {
    if (!socket) {
      console.log("Socket not ready yet");
      return;
    }

    console.log("Setting up socket listeners");

    // Handle initial connection
    const handleConnect = () => {
      console.log("✓ Socket connected with ID:", socket.id);
      setIsConnected(true);
      setSocketId(socket.id || null);
    };

    // Handle client count updates
    const handleClientCountUpdate = (data: { count: number }) => {
      console.log(`📊 Client count: ${data.count}`);
      setConnectedClients(data.count);
    };

    // Handle disconnection
    const handleDisconnect = () => {
      console.log("✗ Socket disconnected");
      setIsConnected(false);
      setConnectedClients(0);
    };

    // Handle connection error
    const handleConnectError = (error: Error) => {
      console.error("✗ Socket connection error:", error);
      setIsConnected(false);
    };

    // Add event listeners
    socket.on("connect", handleConnect);
    socket.on("clientCountUpdate", handleClientCountUpdate);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    // If already connected, trigger connect handler
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("clientCountUpdate", handleClientCountUpdate);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
    };
  }, [socket, setConnectedClients, setIsConnected, setSocketId]);

  return (
      <Router>
      <Routes>
      <Route path="/" element={<Home/>}/>
      <Route path="/canvas" element={<DrawingCanvas socket={socket} />}/>
      </Routes>
      </Router>
  );
}

export default App;
