import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "@/hooks/useSocket";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { useDrawingStore } from "@/store/drawingStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Player, ChatMessage, ScoreDelta } from "@/types/drawing";

export function Canvas() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const socket = useSocket();
  const [showRoomErrorModal, setShowRoomErrorModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const {
    setConnectedClients, setIsConnected, setSocketId,
    setPlayers, addChatMessage, clearChatMessages,
    setWordHint, setWordLengths, setCurrentWord, setTimeLeft,
    setIsDrawer, setCurrentDrawerId, setCurrentDrawerName,
    setGamePhase, setRoundNumber, setMaxRounds, setHasGuessedCorrectly,
    setWordChoices, setIsSelectingWord, setWordSelectTimeLeft,
    setRoundScoreDelta, setHostId, setMaxPlayers, setRoomError, roomError,
    username,
  } = useDrawingStore();

  // ── Validate roomCode on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode) {
      navigate("/");
    }
  }, [roomCode, navigate]);

  // ── Copy room code handler ─────────────────────────────────────────────────
  const handleCopyRoomCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // ── Connection events ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socket.id || null);
      if (username && roomCode) {
        socket.emit("joinRoom", { roomCode, username }, (result: { success: boolean; error?: string }) => {
          if (!result.success) {
            setRoomError(result.error || "Failed to join room");
            setShowRoomErrorModal(true);
          }
        });
      }
    };
    const handleClientCountUpdate = (data: { count: number }) => setConnectedClients(data.count);
    const handleDisconnect = () => {
      setIsConnected(false);
      setConnectedClients(0);
      // Redirect to home when disconnected
      navigate("/");
    };
    const handleConnectError = () => setIsConnected(false);

    socket.on("connect",           handleConnect);
    socket.on("clientCountUpdate", handleClientCountUpdate);
    socket.on("disconnect",        handleDisconnect);
    socket.on("connect_error",     handleConnectError);

    if (socket.connected) handleConnect();

    return () => {
      socket.off("connect",           handleConnect);
      socket.off("clientCountUpdate", handleClientCountUpdate);
      socket.off("disconnect",        handleDisconnect);
      socket.off("connect_error",     handleConnectError);
    };
  }, [socket, username, roomCode, setConnectedClients, setIsConnected, setSocketId, navigate, setRoomError]);

  // ── Game events ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handlePlayerList = (data: { players: Player[]; maxPlayers: number }) => {
      setPlayers(data.players);
      setMaxPlayers(data.maxPlayers);
    };

    const handleGamePhase = (data: {
      phase: string;
      maxRounds?: number;
      round?: number;
      drawerUsername?: string;
    }) => {
      setGamePhase(data.phase as any);
      if (data.maxRounds) setMaxRounds(data.maxRounds);
      if (data.round)     setRoundNumber(data.round);
      if (data.drawerUsername) setCurrentDrawerName(data.drawerUsername);

      // Entering selectingWord phase — make sure word-selection state is clean
      if (data.phase === "selectingWord") {
        setIsSelectingWord(true);
      }
    };

    /** Sent ONLY to the active drawer — gives them their word choices */
    const handleWordChoices = (data: {
      choices: string[];
      round: number;
      drawerUsername: string;
      wordSelectTime: number;
    }) => {
      setWordChoices(data.choices);
      setIsSelectingWord(true);
      setWordSelectTimeLeft(data.wordSelectTime);
      setRoundNumber(data.round);
      setCurrentDrawerName(data.drawerUsername);
      setIsDrawer(true);
    };

    /** Broadcast after drawer (or timeout) confirms a word */
    const handleRoundStart = (data: {
      round: number;
      drawerId: string;
      drawerUsername: string;
      wordHint: string;
      wordLengths: number[];
      timeLeft: number;
    }) => {
      setRoundNumber(data.round);
      setCurrentDrawerId(data.drawerId);
      setCurrentDrawerName(data.drawerUsername);
      setWordHint(data.wordHint);
      setWordLengths(data.wordLengths ?? []);
      setTimeLeft(data.timeLeft);
      setIsDrawer(data.drawerId === socket.id);
      setCurrentWord(null);
      setHasGuessedCorrectly(false);
      setGamePhase("drawing");
      setIsSelectingWord(false);
      setWordChoices([]);

      addChatMessage({
        id: `sys-${Date.now()}`,
        playerId: "system", username: "Game",
        text: `🎨 Round ${data.round} started! ${data.drawerUsername} is drawing.`,
        type: "system", timestamp: Date.now(),
      });
    };

    /** Sent only to the drawer after the word is confirmed */
    const handleYourWord = (data: { word: string }) => setCurrentWord(data.word);

    const handleTimerUpdate = (data: { timeLeft: number }) => setTimeLeft(data.timeLeft);

    /** Sent when a hint letter is revealed */
    const handleHintUpdate = (data: { wordHint: string }) => setWordHint(data.wordHint);

    const handleNewChatMessage = (msg: ChatMessage) => addChatMessage(msg);

    const handleCorrectGuess = (data: { playerId: string; username: string; points: number }) => {
      addChatMessage({
        id: `correct-${Date.now()}`,
        playerId: "system", username: "Game",
        text: `🎉 ${data.username} guessed correctly! (+${data.points} pts)`,
        type: "correct", timestamp: Date.now(),
      });
      if (data.playerId === socket.id) setHasGuessedCorrectly(true);
    };

    const handleRoundEnd = (data: {
      word: string;
      players: Player[];
      scoreDelta: ScoreDelta[];
    }) => {
      setGamePhase("roundEnd");
      setPlayers(data.players);
      setWordHint(data.word);
      setCurrentWord(null);
      setIsDrawer(false);
      setIsSelectingWord(false);
      setRoundScoreDelta(data.scoreDelta ?? []);

      addChatMessage({
        id: `roundend-${Date.now()}`,
        playerId: "system", username: "Game",
        text: `⏰ Round over! The word was: "${data.word}"`,
        type: "system", timestamp: Date.now(),
      });
    };

    const handleGameEnd = (data: { winner: Player; players: Player[] }) => {
      setGamePhase("gameEnd");
      setPlayers(data.players);
      setCurrentDrawerId(null);
      setCurrentWord(null);
      setWordHint("");
      setIsSelectingWord(false);

      addChatMessage({
        id: `gameend-${Date.now()}`,
        playerId: "system", username: "Game",
        text: `🏆 Game over! Winner: ${data.winner.username} with ${data.winner.score} pts!`,
        type: "correct", timestamp: Date.now(),
      });
    };

    const handleWaiting = (data: { message: string }) => {
      setGamePhase("waiting");
      addChatMessage({
        id: `wait-${Date.now()}`,
        playerId: "system", username: "Game",
        text: data.message, type: "system", timestamp: Date.now(),
      });
    };

    const handleRoomCreated = (data: { roomCode: string; hostId: string }) => {
      setHostId(data.hostId);
    };

    const handlePlayerJoined = (data: { username: string; players: Player[]; hostId: string }) => {
      setPlayers(data.players);
      setHostId(data.hostId);
    };

    const handlePlayerLeft = (data: { players: Player[]; hostId: string }) => {
      setPlayers(data.players);
      setHostId(data.hostId);
    };

    const handleHostTransferred = (data: { newHostId: string }) => {
      setHostId(data.newHostId);
    };

    socket.on("playerList",      handlePlayerList);
    socket.on("gamePhase",       handleGamePhase);
    socket.on("wordChoices",     handleWordChoices);
    socket.on("roundStart",      handleRoundStart);
    socket.on("yourWord",        handleYourWord);
    socket.on("timerUpdate",     handleTimerUpdate);
    socket.on("hintUpdate",      handleHintUpdate);
    socket.on("newChatMessage",  handleNewChatMessage);
    socket.on("correctGuess",    handleCorrectGuess);
    socket.on("roundEnd",        handleRoundEnd);
    socket.on("gameEnd",         handleGameEnd);
    socket.on("waiting",         handleWaiting);
    socket.on("roomCreated",     handleRoomCreated);
    socket.on("playerJoined",    handlePlayerJoined);
    socket.on("playerLeft",      handlePlayerLeft);
    socket.on("hostTransferred", handleHostTransferred);

    return () => {
      socket.off("playerList",       handlePlayerList);
      socket.off("gamePhase",        handleGamePhase);
      socket.off("wordChoices",      handleWordChoices);
      socket.off("roundStart",       handleRoundStart);
      socket.off("yourWord",         handleYourWord);
      socket.off("timerUpdate",      handleTimerUpdate);
      socket.off("hintUpdate",       handleHintUpdate);
      socket.off("newChatMessage",   handleNewChatMessage);
      socket.off("correctGuess",     handleCorrectGuess);
      socket.off("roundEnd",         handleRoundEnd);
      socket.off("gameEnd",          handleGameEnd);
      socket.off("waiting",          handleWaiting);
      socket.off("roomCreated",      handleRoomCreated);
      socket.off("playerJoined",     handlePlayerJoined);
      socket.off("playerLeft",       handlePlayerLeft);
      socket.off("hostTransferred",  handleHostTransferred);
    };
  }, [
    socket,
    setPlayers, addChatMessage, clearChatMessages,
    setWordHint, setWordLengths, setCurrentWord, setTimeLeft,
    setIsDrawer, setCurrentDrawerId, setCurrentDrawerName,
    setGamePhase, setRoundNumber, setMaxRounds, setHasGuessedCorrectly,
    setWordChoices, setIsSelectingWord, setWordSelectTimeLeft,
    setRoundScoreDelta, setHostId, setMaxPlayers, setRoomError,
  ]);

  return (
    <div className="h-screen bg-background overflow-hidden">
      {/* Room Code with Copy Button */}
      {roomCode && (
        <div
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            background: "linear-gradient(135deg, rgba(61, 184, 112, 0.95) 0%, rgba(42, 154, 87, 0.95) 100%)",
            border: "2px solid #3db870",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          }}
        >
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: "700",
              color: "white",
              letterSpacing: "1px",
            }}
          >
            {roomCode}
          </span>
          <button
            onClick={handleCopyRoomCode}
            style={{
              padding: "4px 10px",
              background: copied ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.2)",
              color: "white",
              border: "1px solid rgba(255, 255, 255, 0.4)",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: "600",
              transition: "all 0.3s",
              whiteSpace: "nowrap",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = copied ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.3)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = copied ? "rgba(255, 255, 255, 0.3)" : "rgba(255, 255, 255, 0.2)";
            }}
          >
            {copied ? "✓" : "📋"}
          </button>
        </div>
      )}
      
      <DrawingCanvas socket={socket} roomCode={roomCode} />
      
      {/* Room Error Modal */}
      <Dialog open={showRoomErrorModal} onOpenChange={setShowRoomErrorModal}>
        <DialogContent className="sm:max-w-md border-2 border-ink rounded-lg shadow-lg" style={{ background: "linear-gradient(135deg, #fdf6e3 0%, #fffdf4 100%)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#e85555", fontSize: "1.5rem", fontWeight: "800" }}>⚠️ Cannot Join Room</DialogTitle>
          </DialogHeader>
          <div style={{
            padding: "12px",
            background: "rgba(232, 85, 85, 0.08)",
            border: "2px solid #e85555",
            borderRadius: "8px",
            color: "#1a1a2e",
            fontSize: "0.95rem",
            lineHeight: "1.6",
            fontWeight: "500",
          }}>
            {roomError === "Room is full" 
              ? "🏠 This room has reached its maximum player capacity. Please try another room."
              : roomError === "Room not found"
              ? "🔍 This room does not exist. Please check the room code."
              : roomError || "⚡ An error occurred while trying to join the room."}
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <Button
              onClick={() => {
                setShowRoomErrorModal(false);
                setRoomError(null);
                navigate("/");
              }}
              className="w-full"
              style={{
                background: "linear-gradient(135deg, #4a90d9 0%, #2e5aa8 100%)",
                color: "white",
                fontWeight: "700",
                padding: "10px",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              🏠 Return to Home
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Canvas;