import { Tabs } from "radix-ui";
import { useSocket } from "../../hooks/useSocket";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ROOM_CONSTRAINTS, createRoom, onRoomCreated, joinRoomByCode } from "../../utils";
import background from "../../assets/bg.png"

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');

  :root {
    --ink: #1a1a2e;
    --paper: #fffdf4;
    --gold: #e3b65d;
    --gold-dark: #c49430;
    --green: #3db870;
    --green-dark: #2a9a57;
    --red: #e85555;
    --blue: #4a90d9;
    --cream: #fdf6e3;
  }

  * { box-sizing: border-box; }

  .sketchy-page {
    font-family: 'Nunito', sans-serif;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    position: relative;
    overflow: hidden;
  }

  .sketchy-page::before {
    content: '✏️ 🎨 ✏️ 🖌️ ✏️ 🎨 ✏️ 🖌️ ✏️ 🎨 ✏️ 🖌️';
    position: absolute;
    top: 12px;
    left: 0; right: 0;
    text-align: center;
    font-size: 20px;
    opacity: 0.35;
    letter-spacing: 8px;
    pointer-events: none;
  }

  .sketchy-page::after {
    content: '✏️ 🎨 ✏️ 🖌️ ✏️ 🎨 ✏️ 🖌️ ✏️ 🎨 ✏️ 🖌️';
    position: absolute;
    bottom: 12px;
    left: 0; right: 0;
    text-align: center;
    font-size: 20px;
    opacity: 0.35;
    letter-spacing: 8px;
    pointer-events: none;
  }

  .sketchy-title {
    font-family: 'Fredoka One', cursive;
    font-size: clamp(2.8rem, 8vw, 4.5rem);
    color: var(--gold);
    letter-spacing: 2px;
    text-shadow:
      3px 3px 0 var(--ink),
      -2px -2px 0 var(--ink),
      3px -2px 0 var(--ink),
      -2px 3px 0 var(--ink),
      0 4px 0 var(--ink);
    margin-bottom: 6px;
    animation: titleWobble 3s ease-in-out infinite;
    transform-origin: center bottom;
    cursor: default;
    user-select: none;
  }

  .sketchy-subtitle {
    font-family: 'Nunito', sans-serif;
    font-weight: 800;
    font-size: 0.9rem;
    color: var(--paper);
    letter-spacing: 4px;
    text-transform: uppercase;
    margin-bottom: 32px;
    opacity: 0.85;
    text-shadow: 1px 1px 0 var(--ink);
  }

  @keyframes titleWobble {
    0%, 100% { transform: rotate(-1deg) scale(1); }
    50% { transform: rotate(1deg) scale(1.02); }
  }

  .sketchy-card {
    width: 100%;
    max-width: 380px;
    background: var(--paper);
    border: 3px solid var(--ink);
    border-radius: 12px;
    padding: 28px 28px 24px;
    position: relative;
    box-shadow: 5px 5px 0 var(--ink), 8px 8px 0 rgba(26,26,46,0.15);
    animation: cardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(24px) scale(0.95) rotate(-1deg); }
    to   { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
  }

  .sketchy-card::before {
    content: '★';
    position: absolute;
    top: -14px; left: -14px;
    font-size: 28px;
    color: var(--gold);
    text-shadow: 1px 1px 0 var(--ink);
    transform: rotate(-20deg);
    line-height: 1;
  }

  .sketchy-card::after {
    content: '★';
    position: absolute;
    bottom: -14px; right: -14px;
    font-size: 28px;
    color: var(--gold);
    text-shadow: 1px 1px 0 var(--ink);
    transform: rotate(15deg);
    line-height: 1;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    margin-bottom: 12px;
    border: none;
    padding: 0;
  }

  .form-label {
    font-weight: 800;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--ink);
    margin-bottom: 5px;
  }

  .form-label-icon { margin-right: 5px; }

  .sketchy-input {
    width: 100%;
    padding: 10px 14px;
    font-family: 'Nunito', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    background: var(--cream);
    border: 2.5px solid var(--ink);
    border-radius: 8px;
    outline: none;
    box-shadow: 3px 3px 0 var(--ink);
    transition: box-shadow 0.15s, transform 0.15s;
    color: var(--ink);
  }

  .sketchy-input::placeholder { color: #bba; font-weight: 600; }
  .sketchy-input:focus {
    box-shadow: 4px 4px 0 var(--gold-dark);
    transform: translate(-1px, -1px);
    border-color: var(--gold-dark);
  }

  .tabs-list {
    display: flex;
    margin: 20px 0 18px;
    border: 2.5px solid var(--ink);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 3px 3px 0 var(--ink);
  }

  .tab-trigger {
    flex: 1;
    padding: 10px 8px;
    font-family: 'Fredoka One', cursive;
    font-size: 1rem;
    letter-spacing: 0.5px;
    background: var(--cream);
    border: none;
    border-right: 2.5px solid var(--ink);
    cursor: pointer;
    color: #888;
    transition: background 0.15s, color 0.15s;
    outline: none;
  }

  .tab-trigger:last-child { border-right: none; }
  .tab-trigger:hover { background: #f5edcf; color: var(--ink); }
  .tab-trigger[data-state='active'] { background: var(--gold); color: var(--ink); }

  .tab-content[data-state='active'] {
    animation: tabSlideIn 0.2s ease both;
  }
  @keyframes tabSlideIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 4px;
  }

  select.sketchy-input {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%231a1a2e' stroke-width='2.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
    cursor: pointer;
  }

  .btn-primary {
    width: 100%;
    margin-top: 6px;
    padding: 12px 20px;
    font-family: 'Fredoka One', cursive;
    font-size: 1.15rem;
    letter-spacing: 1px;
    background: var(--green);
    color: #fff;
    border: 2.5px solid var(--ink);
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 4px 4px 0 var(--ink);
    transition: box-shadow 0.12s, transform 0.12s, background 0.12s;
    outline: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-shadow: 1px 1px 0 rgba(0,0,0,0.3);
  }

  .btn-primary:hover:not(:disabled) { background: var(--green-dark); box-shadow: 5px 5px 0 var(--ink); transform: translate(-1px, -1px); }
  .btn-primary:active:not(:disabled) { box-shadow: 2px 2px 0 var(--ink); transform: translate(2px, 2px); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .room-code-input {
    font-family: 'Fredoka One', cursive;
    font-size: 1.4rem;
    letter-spacing: 6px;
    text-align: center;
    text-transform: uppercase;
  }

  .room-code-input::placeholder {
    letter-spacing: 4px;
    font-size: 1rem;
    font-family: 'Nunito', sans-serif;
    font-weight: 600;
    opacity: 0.5;
  }

  /* ── User count badge on input ── */
  .input-wrapper { position: relative; }
`

import { useSocket } from "../../hooks/useSocket";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ROOM_CONSTRAINTS, createRoom, onRoomCreated, joinRoomByCode } from "../../utils";

const Home = () => {
  const socket    = useSocket();
  const navigate  = useNavigate();

  const [maxPlayers, setMaxPlayers] = useState(ROOM_CONSTRAINTS.maxPlayers.default);
  const [rounds,     setRounds    ] = useState(ROOM_CONSTRAINTS.rounds.default);
  const [roundTime,  setRoundTime ] = useState(ROOM_CONSTRAINTS.roundTime.default);
  const [isCreating, setIsCreating] = useState(false);
  const [createError,setCreateError] = useState("");
  const [socketReady,setSocketReady] = useState(false);

  const [createUsername, setCreateUsername] = useState("");
  
  // Join room state
  const [joinUsername, setJoinUsername] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (!socket) { setSocketReady(false); return; }
    setSocketReady(true);

    const cleanup = onRoomCreated(socket, (code: string) => {
      setIsCreating(false);
      // Token tells canvas page that join was already emitted here —
      // skip the duplicate joinRoomByCode on its handleConnect.
      sessionStorage.setItem(`room_join_${code}`, Date.now().toString());
      navigate(`/${code}`);
    });

    return cleanup;
  }, [socket, navigate]);

  const handleCreateRoom = async () => {
    if (!socket) {
      alert("Still connecting to server... please wait");
      return;
    }

    if (!createUsername.trim()) {
      alert("Please enter a username");
      return;
    }
    
    setIsCreating(true);

    const result = await createRoom(socket, {
      maxPlayers,
      rounds,
      roundTime,
      username: createUsername.trim(),
    });

    if (!result.success) {
      alert("Failed to create room: " + result.error);
      setIsCreating(false);
    } else {
      localStorage.setItem("playerUsername", createUsername.trim());
      // Navigation handled by onRoomCreated listener above
    }
  };

  const handleCopyRoomCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      // Copy successful, will navigate shortly
    } catch (err) {
      setAlertMessage("Failed to copy room code");
      setAlertOpen(true);
    }
  };

  const handleJoinRoom = async () => {
    if (!socket) {
      alert("Still connecting to server... please wait");
      return;
    }

    if (!joinRoomCode.trim()) {
      alert("Please enter a room code");
      return;
    }

    if (!joinUsername.trim()) {
      alert("Please enter a username");
      return;
    }

    setIsJoining(true);

    const result = await joinRoomByCode(socket, joinRoomCode.toUpperCase().trim(), joinUsername.trim());

    if (result.success) {
      localStorage.setItem("playerUsername", joinUsername.trim());
      sessionStorage.setItem(`room_join_${joinRoomCode.toUpperCase().trim()}`, Date.now().toString());
      navigate(`/${joinRoomCode.toUpperCase().trim()}`);
    } else {
      alert("Failed to join room: " + result.error);
      setIsJoining(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div
        className="sketchy-page"
        style={{ backgroundImage: `url(${background})` }}
      >
        <h1 className="sketchy-title">Sketchy Frenzy</h1>
        <p className="sketchy-subtitle">🖍 Draw • Guess • Win 🏆</p>

        <div className="sketchy-card">
          <Tabs.Root defaultValue="create">
            <Tabs.List className="tabs-list">
              <Tabs.Trigger value="create" className="tab-trigger">🏠 Create Room</Tabs.Trigger>
              <Tabs.Trigger value="join"   className="tab-trigger">🚪 Join Room</Tabs.Trigger>
            </Tabs.List>

            {/* ── Create Room ── */}
            <Tabs.Content value="create" className="tab-content">
              <fieldset className="form-row">
                <label className="form-label"><span className="form-label-icon">👤</span>Your Username</label>
                <input
                  type="text" placeholder="Enter your name (max 8 chars)"
                  maxLength={8} value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  className="sketchy-input"
                />
              </fieldset>

              <div className="settings-grid">
                <fieldset className="form-row" style={{ margin: 0 }}>
                  <label className="form-label"><span className="form-label-icon">👥</span>Max Players</label>
                  <input
                    type="number"
                    min={ROOM_CONSTRAINTS.maxPlayers.min}
                    max={ROOM_CONSTRAINTS.maxPlayers.max}
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="sketchy-input"
                  />
                </fieldset>

                <fieldset className="form-row" style={{ margin: 0 }}>
                  <label className="form-label"><span className="form-label-icon">🔄</span>Rounds</label>
                  <input
                    type="number"
                    min={ROOM_CONSTRAINTS.rounds.min}
                    max={ROOM_CONSTRAINTS.rounds.max}
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                    className="sketchy-input"
                  />
                </fieldset>
              </div>

              <div style={{ marginTop: 10 }}>
                <fieldset className="form-row">
                  <label className="form-label"><span className="form-label-icon">⏱</span>Round Time</label>
                  <select
                    value={roundTime}
                    onChange={(e) => setRoundTime(Number(e.target.value))}
                    className="sketchy-input"
                  >
                    {ROOM_CONSTRAINTS.roundTime.options.map((t) => (
                      <option key={t} value={t}>{t} sec</option>
                    ))}
                  </select>
                </fieldset>
              </div>

              {createError && <div className="error-msg">{createError}</div>}

              <button
                className="btn-primary"
                style={{ marginTop: 18 }}
                onClick={handleCreateRoom}
                disabled={isCreating || !socketReady}
              >
                {isCreating ? "Creating…" : socketReady ? "✨ Create Room" : "🔌 Connecting…"}
              </button>
            </Tabs.Content>

            {/* ── Join Room ── */}
            <Tabs.Content value="join" className="tab-content">
              <div style={{ padding: "10px 0 4px" }}>
                <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#888", textAlign: "center", marginBottom: 16, letterSpacing: 1 }}>
                  Got a code? Hop right in! 🎉
                </p>

                <fieldset className="form-row">
                  <label className="form-label"><span className="form-label-icon">👤</span>Username</label>
                  <input
                    type="text" placeholder="Enter your name (max 8 chars)"
                    maxLength={8} value={joinUsername}
                    onChange={(e) => setJoinUsername(e.target.value)}
                    className="sketchy-input"
                  />
                </fieldset>

                <fieldset className="form-row">
                  <label className="form-label"><span className="form-label-icon">🔑</span>Room Code</label>
                  <input
                    type="text" placeholder="e.g. ABCD1234"
                    maxLength={8} value={joinRoomCode}
                    onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                    className="sketchy-input room-code-input"
                  />
                </fieldset>

                {joinError && <div className="error-msg">{joinError}</div>}

                <button
                  className="btn-primary"
                  style={{ marginTop: 8 }}
                  onClick={handleJoinRoom}
                  disabled={isJoining || !socketReady}
                >
                  {isJoining ? "Joining…" : socketReady ? "🚀 Join Room" : "🔌 Connecting…"}
                </button>
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
      
      {/* Alert Modal */}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent className="sm:max-w-md border-2 border-ink rounded-lg shadow-lg" style={{ background: "linear-gradient(135deg, #fdf6e3 0%, #fffdf4 100%)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#1a1a2e", fontSize: "1.5rem", fontWeight: "800" }}>📬 Notice</DialogTitle>
          </DialogHeader>
          <div style={{
            padding: "12px",
            background: "rgba(58, 144, 217, 0.08)",
            border: "2px solid #4a90d9",
            borderRadius: "8px",
            color: "#1a1a2e",
            fontSize: "0.95rem",
            lineHeight: "1.6",
            fontWeight: "500",
          }}>
            {alertMessage}
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <Button
              onClick={() => setAlertOpen(false)}
              className="w-full"
              style={{
                background: "linear-gradient(135deg, #3db870 0%, #2a9a57 100%)",
                color: "white",
                fontWeight: "700",
                padding: "10px",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              ✓ Got it!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Home;