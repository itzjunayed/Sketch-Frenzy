import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSocket } from "@/hooks/useSocket";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { useDrawingStore } from "@/store/drawingStore";
import type { Player, ChatMessage, ScoreDelta } from "@/types/drawing";
import background from "../../assets/bg.png"

// ── Join-modal styles (matches the home page sketchy aesthetic) ───────────────
const JOIN_MODAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');

  .jm-backdrop {
    position: fixed; inset: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    z-index: 9999; font-family: 'Nunito', sans-serif; padding: 20px;
  }

  .jm-logo {
    font-family: 'Fredoka One', cursive;
    font-size: clamp(2rem, 6vw, 3rem); color: #e3b65d;
    text-shadow: 3px 3px 0 #1a1a2e, -1px -1px 0 #1a1a2e,
                 2px -1px 0 #1a1a2e, -1px 2px 0 #1a1a2e;
    margin-bottom: 6px; letter-spacing: 2px;
  }

  .jm-room-pill {
    font-family: 'Fredoka One', cursive; font-size: 0.9rem;
    color: #000000; background: rgb(255 209 0 / 60%);
    border: 1.5px solid rgba(255,253,244,.25);
    border-radius: 20px; padding: 4px 18px; margin-bottom: 24px;
    letter-spacing: 3px;
  }

  .jm-card {
    width: 100%; max-width: 360px; background: #fffdf4;
    border: 3px solid #1a1a2e; border-radius: 12px;
    padding: 28px 28px 22px; position: relative;
    box-shadow: 6px 6px 0 #1a1a2e, 10px 10px 0 rgba(26,26,46,.18);
    animation: jmIn .4s cubic-bezier(.34,1.56,.64,1) both;
  }

  @keyframes jmIn {
    from { opacity: 0; transform: translateY(20px) scale(.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .jm-card::before {
    content: '★'; position: absolute; top: -14px; left: -14px;
    font-size: 26px; color: #e3b65d; text-shadow: 1px 1px 0 #1a1a2e;
    transform: rotate(-20deg);
  }

  .jm-card::after {
    content: '★'; position: absolute; bottom: -14px; right: -14px;
    font-size: 26px; color: #e3b65d; text-shadow: 1px 1px 0 #1a1a2e;
    transform: rotate(15deg);
  }

  .jm-heading {
    font-family: 'Fredoka One', cursive; font-size: 1.3rem;
    color: #1a1a2e; margin-bottom: 4px; letter-spacing: .5px;
  }

  .jm-sub {
    font-size: .78rem; font-weight: 800; color: #888;
    text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 20px;
  }

  .jm-row { display: flex; flex-direction: column; margin-bottom: 14px; border: none; padding: 0; }

  .jm-label {
    font-weight: 800; font-size: .72rem; text-transform: uppercase;
    letter-spacing: 1.5px; color: #1a1a2e; margin-bottom: 5px;
  }

  .jm-input {
    all: unset; box-sizing: border-box; width: 100%;
    padding: 10px 14px; font-family: 'Nunito', sans-serif;
    font-size: 1rem; font-weight: 700; background: #fdf6e3;
    border: 2.5px solid #1a1a2e; border-radius: 8px;
    box-shadow: 3px 3px 0 #1a1a2e; color: #1a1a2e;
    transition: box-shadow .15s, transform .15s;
  }

  .jm-input::placeholder { color: #bba; font-weight: 600; }

  .jm-input:focus {
    box-shadow: 4px 4px 0 #c49430; transform: translate(-1px,-1px);
    border-color: #c49430; outline: none;
  }

  .jm-error {
    margin-bottom: 12px; padding: 8px 12px; background: #ffeaea;
    border: 2px solid #e85555; border-radius: 8px;
    font-size: .82rem; font-weight: 700; color: #e85555; text-align: center;
  }

  .jm-btn-join {
    all: unset; box-sizing: border-box; width: 100%; padding: 12px 20px;
    font-family: 'Fredoka One', cursive; font-size: 1.1rem; letter-spacing: 1px;
    background: #3db870; color: #fff; border: 2.5px solid #1a1a2e;
    border-radius: 8px; cursor: pointer; box-shadow: 4px 4px 0 #1a1a2e;
    transition: box-shadow .12s, transform .12s, background .12s;
    text-align: center; display: block;
    text-shadow: 1px 1px 0 rgba(0,0,0,.25); margin-bottom: 10px;
  }

  .jm-btn-join:hover:not(:disabled) {
    background: #2a9a57; box-shadow: 5px 5px 0 #1a1a2e;
    transform: translate(-1px,-1px);
  }

  .jm-btn-join:active:not(:disabled) { box-shadow: 2px 2px 0 #1a1a2e; transform: translate(2px,2px); }
  .jm-btn-join:disabled { opacity: .55; cursor: not-allowed; }

  .jm-btn-home {
    all: unset; box-sizing: border-box; width: 100%; padding: 8px;
    font-family: 'Nunito', sans-serif; font-size: .85rem; font-weight: 700;
    color: #888; text-align: center; cursor: pointer;
    display: block; transition: color .15s;
  }
  .jm-btn-home:hover { color: #1a1a2e; }

  .jm-spinner {
    margin-top: 10px; font-size: .75rem; font-weight: 700;
    color: #aaa; text-align: center; letter-spacing: 1px;
    animation: jmPulse 1.2s ease-in-out infinite;
  }
  @keyframes jmPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
`;

// ── JoinModal ─────────────────────────────────────────────────────────────────

interface JoinModalProps {
  roomCode: string;
  username: string;
  error: string;
  loading: boolean;
  connected: boolean;
  onUsernameChange: (v: string) => void;
  onJoin: () => void;
  onGoHome: () => void;
}

function JoinModal({ roomCode, username, error, loading, connected, onUsernameChange, onJoin, onGoHome }: JoinModalProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: JOIN_MODAL_STYLES }} />
      <div className="jm-backdrop" style={{ backgroundImage: `url(${background})` }}>
        <div className="jm-logo">✏️ Sketchy Frenzy</div>
        <div className="jm-room-pill">🔑 {roomCode}</div>

        <div className="jm-card">
          <div className="jm-heading">Join Room</div>
          <div className="jm-sub">Enter your name to play</div>

          <fieldset className="jm-row">
            <label className="jm-label">👤 Your Name</label>
            <input
              className="jm-input"
              type="text"
              placeholder="Max 8 characters"
              maxLength={8}
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && onJoin()}
              autoFocus
            />
          </fieldset>

          {error && <div className="jm-error">{error}</div>}

          <button
            className="jm-btn-join"
            onClick={onJoin}
            disabled={loading || !connected}
          >
            {!connected ? "🔌 Connecting…" : loading ? "Joining…" : "🚀 Join Room"}
          </button>

          <button className="jm-btn-home" onClick={onGoHome}>
            ← Back to Home
          </button>

          {!connected && <div className="jm-spinner">Reconnecting to server…</div>}
        </div>
      </div>
    </>
  );
}

// ── Canvas page ───────────────────────────────────────────────────────────────

// joinPhase drives what we render:
//  "connecting" → brief splash while socket handshakes (only on first load)
//  "modal"      → user needs to enter name (direct URL / page reload)
//  "joined"     → full game UI
type JoinPhase = "connecting" | "modal" | "joined";

export function Canvas() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const socket = useSocket();

  const {
    setConnectedClients, setIsConnected, isConnected, setSocketId,
    setPlayers, addChatMessage, clearChatMessages,
    setWordHint, setWordLengths, setCurrentWord, setTimeLeft,
    setIsDrawer, setCurrentDrawerId, setCurrentDrawerName,
    setGamePhase, setRoundNumber, setMaxRounds, setHasGuessedCorrectly,
    setWordChoices, setIsSelectingWord, setWordSelectTimeLeft,
    setRoundScoreDelta, setHostId, setMaxPlayers,
    setUsername, username,
  } = useDrawingStore();

  const [joinPhase, setJoinPhase]     = useState<JoinPhase>("connecting");
  const [joinUsername, setJoinUsername] = useState("");
  const [joinError, setJoinError]     = useState("");
  const [joinLoading, setJoinLoading] = useState(false);

  // Persists across socket reconnects within the same browser session.
  // Once true we skip the modal and auto-rejoin on reconnect.
  const hasJoinedRef = useRef(false);

  // ── Validate roomCode ──────────────────────────────────────────────────────
  useEffect(() => { if (!roomCode) navigate("/"); }, [roomCode, navigate]);

  // ── Duplicate-tab detection ────────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode) return;
    const channel = new BroadcastChannel("sketchy_room_tabs");
    let isOriginal = false;
    let pingTimeout: ReturnType<typeof setTimeout>;

    channel.addEventListener("message", (e: MessageEvent) => {
      if (e.data.roomCode !== roomCode) return;
      if (e.data.type === "room_pong") {
        clearTimeout(pingTimeout);
        channel.close();
        navigate("/");
      }
      if (e.data.type === "room_ping" && isOriginal) {
        channel.postMessage({ type: "room_pong", roomCode });
      }
    });

    channel.postMessage({ type: "room_ping", roomCode });
    pingTimeout = setTimeout(() => { isOriginal = true; }, 250);

    return () => { clearTimeout(pingTimeout); channel.close(); };
  }, [roomCode, navigate]);

  // ── Shared join helper ─────────────────────────────────────────────────────
  const emitJoin = (sock: NonNullable<typeof socket>, uname: string, cb: (ok: boolean, err?: string) => void) => {
    sock.emit(
      "joinRoomByCode",
      { roomCode, username: uname },
      (result: { success: boolean; error?: string }) => {
        if (result?.success) {
          localStorage.setItem("playerUsername", uname);
          setUsername(uname);
          hasJoinedRef.current = true;
          cb(true);
        } else {
          cb(false, result?.error ?? "Failed to join room.");
        }
      }
    );
  };

  // ── Connection events ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socket.id || null);

      // Case A: already joined this session (socket reconnected after network drop)
      if (hasJoinedRef.current) {
        const uname = username || localStorage.getItem("playerUsername") || "";
        if (!uname) { navigate("/"); return; }
        emitJoin(socket, uname, (ok) => { if (!ok) { hasJoinedRef.current = false; navigate("/"); } });
        return;
      }

      // Case B: fresh navigation from home (join was already emitted there)
      const tokenKey = `room_join_${roomCode}`;
      const rawToken = sessionStorage.getItem(tokenKey);
      const tokenAge = rawToken ? Date.now() - Number(rawToken) : Infinity;
      if (tokenAge < 8_000) {
        sessionStorage.removeItem(tokenKey);
        hasJoinedRef.current = true;
        const saved = localStorage.getItem("playerUsername") || "";
        if (saved && !username) setUsername(saved);
        setJoinPhase("joined");
        return;
      }

      // Case C: direct URL or page reload → show the join modal
      const saved = localStorage.getItem("playerUsername") || "";
      setJoinUsername(saved);
      setJoinPhase("modal");
    };

    const handleDisconnect    = () => { setIsConnected(false); setConnectedClients(0); };
    const handleConnectError  = () =>   setIsConnected(false);
    const handleCount         = (d: { count: number }) => setConnectedClients(d.count);
    const handleKicked        = (_: { reason: string }) => navigate("/");

    socket.on("connect",           handleConnect);
    socket.on("disconnect",        handleDisconnect);
    socket.on("connect_error",     handleConnectError);
    socket.on("clientCountUpdate", handleCount);
    socket.on("kicked",            handleKicked);

    if (socket.connected) handleConnect();

    return () => {
      socket.off("connect",           handleConnect);
      socket.off("disconnect",        handleDisconnect);
      socket.off("connect_error",     handleConnectError);
      socket.off("clientCountUpdate", handleCount);
      socket.off("kicked",            handleKicked);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomCode]);

  // ── Modal join button handler ──────────────────────────────────────────────
  const handleModalJoin = () => {
    const uname = joinUsername.trim().slice(0, 8);
    if (!uname)   { setJoinError("Please enter a username."); return; }
    if (!socket)  { setJoinError("Still connecting — please wait."); return; }

    setJoinError("");
    setJoinLoading(true);

    emitJoin(socket, uname, (ok, err) => {
      if (ok) {
        setJoinPhase("joined");
      } else {
        setJoinError(err ?? "Failed to join room.");
      }
      setJoinLoading(false);
    });
  };

  // ── Game events ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const h = {
      playerList: (d: { players: Player[]; maxPlayers: number }) => {
        setPlayers(d.players); setMaxPlayers(d.maxPlayers);
      },
      gamePhase: (d: { phase: string; maxRounds?: number; round?: number; drawerUsername?: string }) => {
        setGamePhase(d.phase as any);
        if (d.maxRounds)      setMaxRounds(d.maxRounds);
        if (d.round)          setRoundNumber(d.round);
        if (d.drawerUsername) setCurrentDrawerName(d.drawerUsername);
        if (d.phase === "selectingWord") setIsSelectingWord(true);
      },
      wordChoices: (d: { choices: string[]; round: number; drawerUsername: string; wordSelectTime: number }) => {
        setWordChoices(d.choices); setIsSelectingWord(true);
        setWordSelectTimeLeft(d.wordSelectTime);
        setRoundNumber(d.round); setCurrentDrawerName(d.drawerUsername); setIsDrawer(true);
      },
      roundStart: (d: { round: number; drawerId: string; drawerUsername: string; wordHint: string; wordLengths: number[]; timeLeft: number }) => {
        setRoundNumber(d.round); setCurrentDrawerId(d.drawerId);
        setCurrentDrawerName(d.drawerUsername); setWordHint(d.wordHint);
        setWordLengths(d.wordLengths ?? []); setTimeLeft(d.timeLeft);
        setIsDrawer(d.drawerId === socket.id); setCurrentWord(null);
        setHasGuessedCorrectly(false); setGamePhase("drawing");
        setIsSelectingWord(false); setWordChoices([]);
        addChatMessage({ id: `sys-${Date.now()}`, playerId: "system", username: "Game",
          text: `🎨 Round ${d.round} started! ${d.drawerUsername} is drawing.`,
          type: "system", timestamp: Date.now() });
      },
      yourWord:        (d: { word: string })    => setCurrentWord(d.word),
      timerUpdate:     (d: { timeLeft: number }) => setTimeLeft(d.timeLeft),
      hintUpdate:      (d: { wordHint: string }) => setWordHint(d.wordHint),
      newChatMessage:  (msg: ChatMessage) => addChatMessage(msg),
      correctGuess:    (d: { playerId: string; username: string; points: number }) => {
        addChatMessage({ id: `correct-${Date.now()}`, playerId: "system", username: "Game",
          text: `🎉 ${d.username} guessed correctly! (+${d.points} pts)`,
          type: "correct", timestamp: Date.now() });
        if (d.playerId === socket.id) setHasGuessedCorrectly(true);
      },
      roundEnd: (d: { word: string; players: Player[]; scoreDelta: ScoreDelta[] }) => {
        setGamePhase("roundEnd"); setPlayers(d.players); setWordHint(d.word);
        setCurrentWord(null); setIsDrawer(false); setIsSelectingWord(false);
        setRoundScoreDelta(d.scoreDelta ?? []);
        addChatMessage({ id: `re-${Date.now()}`, playerId: "system", username: "Game",
          text: `⏰ Round over! The word was: "${d.word}"`, type: "system", timestamp: Date.now() });
      },
      gameEnd: (d: { winner: Player; players: Player[] }) => {
        setGamePhase("gameEnd"); setPlayers(d.players);
        setCurrentDrawerId(null); setCurrentWord(null);
        setWordHint(""); setIsSelectingWord(false);
        addChatMessage({ id: `ge-${Date.now()}`, playerId: "system", username: "Game",
          text: `🏆 Game over! Winner: ${d.winner.username} with ${d.winner.score} pts!`,
          type: "correct", timestamp: Date.now() });
      },
      waiting: (d: { message: string }) => {
        setGamePhase("waiting");
        addChatMessage({ id: `w-${Date.now()}`, playerId: "system", username: "Game",
          text: d.message, type: "system", timestamp: Date.now() });
      },
      gameRestart: () => {
        setGamePhase("waiting"); setRoundNumber(0); setCurrentWord(null);
        setWordHint(""); setWordLengths([]); setIsDrawer(false);
        setCurrentDrawerId(null); setIsSelectingWord(false);
        setWordChoices([]); setHasGuessedCorrectly(false);
        setRoundScoreDelta([]); clearChatMessages();
        addChatMessage({ id: `gr-${Date.now()}`, playerId: "system", username: "Game",
          text: "🔄 The host restarted the game! Waiting to start…",
          type: "system", timestamp: Date.now() });
      },
      roomCreated:     (d: { roomCode: string; hostId: string })                  => setHostId(d.hostId),
      playerJoined:    (d: { username: string; players: Player[]; hostId: string }) => { setPlayers(d.players); setHostId(d.hostId); },
      playerLeft:      (d: { players: Player[]; hostId: string })                  => { setPlayers(d.players); setHostId(d.hostId); },
      hostTransferred: (d: { newHostId: string })                                  => setHostId(d.newHostId),
    };

    (Object.keys(h) as (keyof typeof h)[]).forEach((ev) => socket.on(ev, h[ev] as any));
    return () => { (Object.keys(h) as (keyof typeof h)[]).forEach((ev) => socket.off(ev, h[ev] as any)); };
  }, [
    socket,
    setPlayers, addChatMessage, clearChatMessages,
    setWordHint, setWordLengths, setCurrentWord, setTimeLeft,
    setIsDrawer, setCurrentDrawerId, setCurrentDrawerName,
    setGamePhase, setRoundNumber, setMaxRounds, setHasGuessedCorrectly,
    setWordChoices, setIsSelectingWord, setWordSelectTimeLeft,
    setRoundScoreDelta, setHostId, setMaxPlayers,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!roomCode) return null;

  return (
    <div className="h-screen bg-background overflow-hidden" style={{ position: "relative" }}>

      {/* Brief connecting splash (socket hasn't connected yet) */}
      {joinPhase === "connecting" && (
        <>
          <style dangerouslySetInnerHTML={{ __html: JOIN_MODAL_STYLES }} />
          <div className="jm-backdrop">
            <div className="jm-logo">✏️ Sketchy Frenzy</div>
            <div className="jm-spinner" style={{ marginTop: 16, fontSize: "1rem" }}>
              Connecting…
            </div>
          </div>
        </>
      )}

      {/* Direct-URL / reload join modal */}
      {joinPhase === "modal" && (
        <JoinModal
          roomCode={roomCode}
          username={joinUsername}
          error={joinError}
          loading={joinLoading}
          connected={isConnected}
          onUsernameChange={setJoinUsername}
          onJoin={handleModalJoin}
          onGoHome={() => navigate("/")}
        />
      )}

      {/* Full game UI — only after successfully joining */}
      {joinPhase === "joined" && (
        <DrawingCanvas socket={socket} roomCode={roomCode} />
      )}
    </div>
  );
}

export default Canvas;