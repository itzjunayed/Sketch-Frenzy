import { useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { useDrawingStore } from "@/store/drawingStore";
import type { Player, ChatMessage } from "@/types/drawing";

export function Canvas() {
  const socket = useSocket();
  const {
    setConnectedClients,
    setIsConnected,
    setSocketId,
    setPlayers,
    addChatMessage,
    clearChatMessages,
    setWordHint,
    setCurrentWord,
    setTimeLeft,
    setIsDrawer,
    setCurrentDrawerId,
    setCurrentDrawerName,
    setGamePhase,
    setRoundNumber,
    setMaxRounds,
    setHasGuessedCorrectly,
    username,
  } = useDrawingStore();

  // ── Connection events ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socket.id || null);
      // Re-join game with stored username
      if (username) {
        socket.emit("joinGame", { username });
      }
    };

    const handleClientCountUpdate = (data: { count: number }) => {
      setConnectedClients(data.count);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setConnectedClients(0);
    };

    const handleConnectError = () => {
      setIsConnected(false);
    };

    socket.on("connect", handleConnect);
    socket.on("clientCountUpdate", handleClientCountUpdate);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    if (socket.connected) handleConnect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("clientCountUpdate", handleClientCountUpdate);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
    };
  }, [socket, username, setConnectedClients, setIsConnected, setSocketId]);

  // ── Game events ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Updated player list
    const handlePlayerList = (players: Player[]) => {
      setPlayers(players);
    };

    // Game phase changed (waiting / starting / drawing / roundEnd / gameEnd)
    const handleGamePhase = (data: { phase: string; maxRounds?: number }) => {
      setGamePhase(data.phase as any);
      if (data.maxRounds) setMaxRounds(data.maxRounds);
    };

    // New round starting
    const handleRoundStart = (data: {
      round: number;
      drawerId: string;
      drawerUsername: string;
      wordHint: string;
      timeLeft: number;
    }) => {
      setRoundNumber(data.round);
      setCurrentDrawerId(data.drawerId);
      setCurrentDrawerName(data.drawerUsername);
      setWordHint(data.wordHint);
      setTimeLeft(data.timeLeft);
      setIsDrawer(data.drawerId === socket.id);
      setCurrentWord(null);
      setHasGuessedCorrectly(false);
      setGamePhase("drawing");

      const systemMsg: ChatMessage = {
        id: `sys-${Date.now()}`,
        playerId: "system",
        username: "Game",
        text: `🎨 Round ${data.round} started! ${data.drawerUsername} is drawing.`,
        type: "system",
        timestamp: Date.now(),
      };
      addChatMessage(systemMsg);
    };

    // Only sent to the drawer — the actual word
    const handleYourWord = (data: { word: string }) => {
      setCurrentWord(data.word);
    };

    // Timer tick from server
    const handleTimerUpdate = (data: { timeLeft: number }) => {
      setTimeLeft(data.timeLeft);
    };

    // New chat/guess message
    const handleNewChatMessage = (msg: ChatMessage) => {
      addChatMessage(msg);
    };

    // Someone guessed correctly
    const handleCorrectGuess = (data: {
      playerId: string;
      username: string;
      points: number;
    }) => {
      const systemMsg: ChatMessage = {
        id: `correct-${Date.now()}`,
        playerId: "system",
        username: "Game",
        text: `🎉 ${data.username} guessed correctly! (+${data.points} pts)`,
        type: "correct",
        timestamp: Date.now(),
      };
      addChatMessage(systemMsg);

      // If it's us who guessed correctly
      if (data.playerId === socket.id) {
        setHasGuessedCorrectly(true);
      }
    };

    // Round ended — reveal word and updated scores
    const handleRoundEnd = (data: {
      word: string;
      players: Player[];
    }) => {
      setGamePhase("roundEnd");
      setPlayers(data.players);
      setWordHint(data.word);
      setCurrentWord(null);
      setIsDrawer(false);

      const systemMsg: ChatMessage = {
        id: `roundend-${Date.now()}`,
        playerId: "system",
        username: "Game",
        text: `⏰ Round over! The word was: "${data.word}"`,
        type: "system",
        timestamp: Date.now(),
      };
      addChatMessage(systemMsg);
    };

    // Game over
    const handleGameEnd = (data: {
      winner: Player;
      players: Player[];
    }) => {
      setGamePhase("gameEnd");
      setPlayers(data.players);
      setCurrentDrawerId(null);
      setCurrentWord(null);
      setWordHint("");

      const systemMsg: ChatMessage = {
        id: `gameend-${Date.now()}`,
        playerId: "system",
        username: "Game",
        text: `🏆 Game over! Winner: ${data.winner.username} with ${data.winner.score} pts!`,
        type: "correct",
        timestamp: Date.now(),
      };
      addChatMessage(systemMsg);
    };

    // Waiting for players
    const handleWaiting = (data: { message: string }) => {
      setGamePhase("waiting");
      const systemMsg: ChatMessage = {
        id: `wait-${Date.now()}`,
        playerId: "system",
        username: "Game",
        text: data.message,
        type: "system",
        timestamp: Date.now(),
      };
      addChatMessage(systemMsg);
    };

    socket.on("playerList",    handlePlayerList);
    socket.on("gamePhase",     handleGamePhase);
    socket.on("roundStart",    handleRoundStart);
    socket.on("yourWord",      handleYourWord);
    socket.on("timerUpdate",   handleTimerUpdate);
    socket.on("newChatMessage",handleNewChatMessage);
    socket.on("correctGuess",  handleCorrectGuess);
    socket.on("roundEnd",      handleRoundEnd);
    socket.on("gameEnd",       handleGameEnd);
    socket.on("waiting",       handleWaiting);

    return () => {
      socket.off("playerList",    handlePlayerList);
      socket.off("gamePhase",     handleGamePhase);
      socket.off("roundStart",    handleRoundStart);
      socket.off("yourWord",      handleYourWord);
      socket.off("timerUpdate",   handleTimerUpdate);
      socket.off("newChatMessage",handleNewChatMessage);
      socket.off("correctGuess",  handleCorrectGuess);
      socket.off("roundEnd",      handleRoundEnd);
      socket.off("gameEnd",       handleGameEnd);
      socket.off("waiting",       handleWaiting);
    };
  }, [
    socket,
    setPlayers, addChatMessage, clearChatMessages,
    setWordHint, setCurrentWord, setTimeLeft,
    setIsDrawer, setCurrentDrawerId, setCurrentDrawerName,
    setGamePhase, setRoundNumber, setMaxRounds, setHasGuessedCorrectly,
  ]);

  return (
    <div className="h-screen bg-background overflow-hidden">
      <DrawingCanvas socket={socket} />
    </div>
  );
}

export default Canvas;