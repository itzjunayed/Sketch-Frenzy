import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import {
  Paintbrush, Droplet, RotateCcw, Trash2,
  Send, Eraser, Copy,
} from "lucide-react";
import { useDrawingStore, COLORS } from "@/store/drawingStore";
import { GAME_CONFIG } from "@/config/gameConfig";

interface DrawingCanvasProps {
  socket: Socket | null;
  roomCode?: string;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    flex-shrink: 0;
  }

  /* Center zone: timer + word wrap in a row */
  .gf-topbar-center {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: 0;
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
    flex-shrink: 0;
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

  .gf-timer-label {
    font-size: 0.72rem;
    font-weight: 800;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .gf-word-wrap {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--cream);
    border: 2.5px solid var(--ink);
    border-radius: 10px;
    padding: 6px 16px;
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
    flex-shrink: 0;
  }

  .gf-word-hint {
    font-family: 'Fredoka One', cursive;
    font-size: 1.2rem;
    letter-spacing: 5px;
    color: var(--ink);
    white-space: pre;
  }

  .gf-word-char-count {
    font-size: 0.65rem;
    font-weight: 700;
    color: #bbb;
    white-space: nowrap;
    flex-shrink: 0;
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
    flex-shrink: 0;
  }

  .gf-conn {
    display: flex; align-items: center; gap: 5px;
    font-size: 0.75rem; font-weight: 700; white-space: nowrap;
    flex-shrink: 0;
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
    background: rgba(255,253,244,.88);
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

  /* ── Word selector overlay ── */
  .gf-word-select-overlay {
    position: absolute; inset: 0; z-index: 20;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: rgba(255,253,244,.95);
    border-radius: 2px;
    gap: 14px;
    padding: 20px;
  }

  .gf-word-select-title {
    font-family: 'Fredoka One', cursive;
    font-size: 1.6rem;
    color: var(--gold);
    text-shadow: 2px 2px 0 var(--ink), -1px -1px 0 var(--ink);
    text-align: center;
  }

  .gf-word-select-sub {
    font-size: 0.85rem; font-weight: 700;
    color: #666; text-align: center; margin-top: -8px;
  }

  .gf-word-choices {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 320px;
  }

  .gf-word-choice-btn {
    width: 100%;
    padding: 12px 16px;
    font-family: 'Fredoka One', cursive;
    font-size: 1.15rem;
    letter-spacing: 1px;
    background: var(--cream);
    color: var(--ink);
    border: 2.5px solid var(--ink);
    border-radius: 10px;
    cursor: pointer;
    box-shadow: 3px 3px 0 var(--ink);
    transition: box-shadow .12s, transform .12s, background .12s;
    outline: none;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .gf-word-choice-btn:hover  { background: #f5edcf; transform: translate(-1px,-1px); box-shadow: 4px 4px 0 var(--ink); }
  .gf-word-choice-btn:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 var(--ink); }

  .gf-word-choice-label {
    flex: 1;
    text-align: center;
    text-transform: uppercase;
  }

  .gf-word-choice-len {
    font-size: 0.7rem;
    font-weight: 700;
    background: var(--ink);
    color: white;
    border-radius: 4px;
    padding: 2px 6px;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: 'Nunito', sans-serif;
  }

  .gf-select-timer {
    font-family: 'Fredoka One', cursive;
    font-size: 2rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .gf-select-timer.urgent { color: var(--red); animation: timerPulse .5s ease-in-out infinite alternate; }
  .gf-select-timer.ok     { color: var(--gold-dark); }
  .gf-select-timer.good   { color: var(--green-dark); }

  .gf-select-hint {
    font-size: 0.75rem; font-weight: 700; color: #999;
    text-align: center; font-style: italic;
  }

  /* ── Round-end score overlay ── */
  .gf-round-end-overlay {
    position: absolute; inset: 0; z-index: 20;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: rgba(255,253,244,.96);
    border-radius: 2px;
    gap: 10px;
    padding: 20px;
    animation: overlayIn .3s cubic-bezier(.34,1.56,.64,1) both;
  }

  @keyframes overlayIn {
    from { opacity:0; transform: scale(.95); }
    to   { opacity:1; transform: scale(1); }
  }

  .gf-round-end-title {
    font-family: 'Fredoka One', cursive;
    font-size: 1.8rem;
    color: var(--gold);
    text-shadow: 2px 2px 0 var(--ink), -1px -1px 0 var(--ink);
    text-align: center;
  }

  .gf-round-end-word {
    font-family: 'Fredoka One', cursive;
    font-size: 1rem;
    color: var(--green-dark);
    background: #d4f5e2;
    border: 2px solid var(--green);
    border-radius: 8px;
    padding: 4px 14px;
    text-align: center;
    letter-spacing: 1px;
  }

  .gf-round-end-scores {
    width: 100%;
    max-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 220px;
    overflow-y: auto;
  }

  .gf-round-end-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: var(--cream);
    border: 2px solid var(--ink);
    border-radius: 8px;
    box-shadow: 2px 2px 0 var(--ink);
  }

  .gf-round-end-rank {
    font-family: 'Fredoka One', cursive;
    font-size: 0.9rem;
    min-width: 20px;
    text-align: center;
    color: #888;
  }

  .gf-round-end-name {
    flex: 1;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gf-round-end-total {
    font-family: 'Fredoka One', cursive;
    font-size: 0.95rem;
    color: var(--blue);
    min-width: 36px;
    text-align: right;
  }

  .gf-round-end-delta {
    font-family: 'Fredoka One', cursive;
    font-size: 0.85rem;
    min-width: 44px;
    text-align: right;
    border-radius: 4px;
    padding: 1px 5px;
  }
  .gf-round-end-delta.positive { color: var(--green-dark); background: #d4f5e2; }
  .gf-round-end-delta.zero     { color: #aaa; }

  .gf-round-end-auto-close {
    font-size: 0.75rem; font-weight: 700; color: #aaa;
    display: flex; align-items: center; gap: 4px;
  }

  .gf-round-end-auto-bar {
    width: 120px; height: 4px;
    background: #e0d8c0;
    border-radius: 2px;
    overflow: hidden;
  }
  .gf-round-end-auto-fill {
    height: 100%;
    background: var(--gold);
    border-radius: 2px;
    transition: width 1s linear;
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
    -webkit-appearance: none;
    appearance: none;
    width: 90px;
    height: 6px;
    background: #e0d8c0;
    border: 2px solid var(--ink);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }

  /* Webkit (Chrome, Safari, Edge) track */
  .gf-size-wrap input[type=range]::-webkit-slider-runnable-track {
    height: 6px;
    background: #e0d8c0;
    border-radius: 3px;
  }

  /* Webkit thumb */
  .gf-size-wrap input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--gold);
    border: 2.5px solid var(--ink);
    box-shadow: 1px 1px 0 var(--ink);
    cursor: pointer;
    margin-top: -8px;
    transition: background .12s, transform .12s;
  }

  .gf-size-wrap input[type=range]::-webkit-slider-thumb:hover {
    background: var(--gold-dark);
    transform: scale(1.15);
  }

  /* Firefox track */
  .gf-size-wrap input[type=range]::-moz-range-track {
    height: 6px;
    background: #e0d8c0;
    border: 2px solid var(--ink);
    border-radius: 3px;
  }

  /* Firefox thumb */
  .gf-size-wrap input[type=range]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--gold);
    border: 2.5px solid var(--ink);
    box-shadow: 1px 1px 0 var(--ink);
    cursor: pointer;
  }

  .gf-size-wrap input[type=range]:disabled {
    opacity: .4; cursor: not-allowed;
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

  .gf-msg.chat    { background: var(--cream); border: 1.5px solid #e0d8c0; }
  .gf-msg.system  { background: #f0f0f0; border: 1.5px solid #ccc; color: #555; font-style: italic; text-align: center; }
  .gf-msg.correct { background: #d4f5e2; border: 1.5px solid var(--green); font-weight: 700; text-align: center; color: var(--ink); }

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

  .gf-chat-input-row {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .gf-chat-char-count {
    font-size: 0.65rem;
    font-weight: 800;
    color: #bbb;
    text-align: right;
    padding-right: 2px;
    letter-spacing: 0.5px;
    line-height: 1;
    transition: color .15s;
  }
  .gf-chat-char-count.warn { color: var(--gold-dark); }
  .gf-chat-char-count.full { color: var(--red); }

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

  .gf-game-end-overlay {
    position: absolute;
    inset: 0;
    background: rgba(26, 26, 46, 0.92);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 30;
    padding: 24px;
    animation: geIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
  }
 
  @keyframes geIn {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }
 
  .gf-game-end-title {
    font-family: 'Fredoka One', cursive;
    font-size: 2rem;
    color: var(--gold);
    text-shadow: 2px 2px 0 var(--ink);
    margin-bottom: 4px;
    letter-spacing: 1px;
  }
 
  .gf-game-end-subtitle {
    font-size: 0.8rem;
    font-weight: 700;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 18px;
  }
 
  .gf-game-end-scores {
    width: 100%;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
    max-height: 260px;
    overflow-y: auto;
  }
 
  .gf-game-end-row {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255,253,244,0.08);
    border: 1.5px solid rgba(255,253,244,0.15);
    border-radius: 8px;
    padding: 8px 12px;
    transition: background 0.15s;
  }
 
  .gf-game-end-row.winner {
    background: rgba(227,182,93,0.18);
    border-color: var(--gold);
  }
 
  .gf-game-end-rank {
    font-size: 1.1rem;
    min-width: 28px;
    text-align: center;
  }
 
  .gf-game-end-name {
    flex: 1;
    font-weight: 700;
    font-size: 0.95rem;
    color: #f0ebe0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
 
  .gf-game-end-pts {
    font-family: 'Fredoka One', cursive;
    font-size: 1rem;
    color: var(--gold);
    white-space: nowrap;
  }
 
  .gf-game-end-restart {
    margin-top: 4px;
    padding: 12px 28px;
    font-family: 'Fredoka One', cursive;
    font-size: 1.1rem;
    letter-spacing: 1px;
    background: var(--green);
    color: #fff;
    border: 2.5px solid #fff;
    border-radius: 10px;
    cursor: pointer;
    box-shadow: 0 4px 0 var(--green-dark);
    transition: box-shadow 0.1s, transform 0.1s;
    outline: none;
  }
 
  .gf-game-end-restart:hover {
    background: var(--green-dark);
    box-shadow: 0 6px 0 #1e7a3f;
    transform: translateY(-2px);
  }
 
  .gf-game-end-restart:active {
    box-shadow: 0 2px 0 var(--green-dark);
    transform: translateY(2px);
  }
 
  .gf-game-end-waiting {
    margin-top: 8px;
    font-size: 0.8rem;
    font-weight: 700;
    color: #888;
    letter-spacing: 1px;
    text-align: center;
  }

  .gf-copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    font-family: 'Fredoka One', cursive;
    font-size: 0.78rem;
    font-weight: 700;
    background: var(--cream);
    color: var(--ink);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 2px 2px 0 var(--ink);
    transition: box-shadow .1s, transform .1s, background .1s;
    white-space: nowrap;
    flex-shrink: 0;
    outline: none;
    letter-spacing: .5px;
  }
 
  .gf-copy-btn:hover {
    background: #f5edcf;
    box-shadow: 3px 3px 0 var(--ink);
    transform: translate(-1px, -1px);
  }
 
  .gf-copy-btn:active {
    box-shadow: 1px 1px 0 var(--ink);
    transform: translate(1px, 1px);
  }
 
  .gf-copy-btn.copied {
    background: #e8f5e9;
    border-color: #2a9a57;
    color: #2a9a57;
    box-shadow: 2px 2px 0 #2a9a57;
  }

  /* ── Canvas: prevent page scroll while drawing on touch ── */
  .gf-canvas-touch { touch-action: none; }

  /* ════════════════════════════════════════════════════════
     RESPONSIVE — Tablet  (≤ 1080px)
  ════════════════════════════════════════════════════════ */
  @media (max-width: 1080px) {
    .gf-root {
      grid-template-columns: 190px 1fr 220px;
    }
    .gf-logo { font-size: 1.1rem; }
    .gf-word-hint { font-size: 1rem; letter-spacing: 3px; }
  }

  /* ════════════════════════════════════════════════════════
     RESPONSIVE — Mobile  (≤ 700px)
     Stack: topbar → canvas+toolbar → chat
     Players panel is hidden; count shown in topbar instead.
  ════════════════════════════════════════════════════════ */
  @media (max-width: 700px) {
    /* Switch to single-column, 3-row stack */
    .gf-root {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr auto;
      /* svh = small viewport height, avoids iOS browser-bar overlap */
      height: 100svh;
      height: 100dvh;
    }

    /* Top bar — wrap on small screens */
    .gf-topbar {
      grid-column: 1;
      padding: 6px 10px;
      gap: 6px;
      height: auto;
      min-height: 46px;
      flex-wrap: wrap;
    }

    .gf-logo { display: none; }

    .gf-topbar-center {
      flex: 1 1 100%;
      order: 2;          /* push hint row below the icon row */
      gap: 6px;
    }

    .gf-timer-wrap {
      padding: 3px 10px;
      box-shadow: 2px 2px 0 var(--ink);
    }

    .gf-timer-num { font-size: 1.2rem; min-width: 28px; }

    .gf-word-wrap {
      padding: 4px 10px;
      box-shadow: 2px 2px 0 var(--ink);
    }

    .gf-word-hint { font-size: 0.95rem; letter-spacing: 3px; }

    .gf-round-badge { font-size: 0.78rem; padding: 2px 7px; order: 1; }

    .gf-conn { order: 1; }
    .gf-conn span { display: none; }  /* hide "Connected" text, keep dot */

    /* Hide players panel — count still visible in topbar */
    .gf-players { display: none; }

    /* Canvas panel takes the flexible middle row */
    .gf-canvas-panel {
      grid-column: 1;
      grid-row: 2;
    }

    /* Toolbar: single scrollable row instead of wrapping */
    .gf-toolbar {
      flex-wrap: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 6px 10px;
      gap: 6px;
      -webkit-overflow-scrolling: touch;
    }

    /* Color grid: single row */
    .gf-color-grid { flex-wrap: nowrap; }

    .gf-color-swatch { width: 26px; height: 26px; flex-shrink: 0; }

    .gf-tool-btn { padding: 5px 9px; font-size: 0.8rem; flex-shrink: 0; }

    .gf-size-wrap input[type=range] { width: 70px; }

    /* Dividers become shorter on mobile */
    .gf-divider-v { height: 22px; }

    /* Chat: fixed height strip at the bottom */
    .gf-chat {
      grid-column: 1;
      grid-row: 3;
      border-left: none;
      border-top: 3px solid var(--ink);
      height: 200px;
      flex-shrink: 0;
    }

    .gf-chat-input-wrap { padding: 6px; }
    .gf-chat-send { width: 34px; height: 34px; }

    /* Word selector / overlays: smaller text */
    .gf-word-select-title { font-size: 1.3rem; }
    .gf-word-choice-btn { font-size: 1rem; padding: 10px 12px; }
    .gf-round-end-title { font-size: 1.4rem; }
    .gf-game-end-title  { font-size: 1.5rem; }
  }
`;

// ─── Fixed canvas resolution ──────────────────────────────────────────────────
// All draw coordinates are in this logical space (0–CANVAS_RESOLUTION).
// The canvas HTML element always has this resolution for its width/height
// attributes; only the CSS display size changes per device. This guarantees
// that a stroke drawn at (x=600, y=700) on a large monitor appears at
// exactly the same position on a small phone screen.
const CANVAS_RESOLUTION = 800;

// ─── Hint helpers ─────────────────────────────────────────────────────────────

/** Total letter count (spaces excluded) from wordLengths array */
function totalLetters(lengths: number[]): number {
  return lengths.reduce((sum, n) => sum + n, 0);
}

/** Human-readable letter count label, e.g. [4,4] → "4 + 4  (8 letters)" */
function hintCountLabel(lengths: number[]): string {
  if (lengths.length === 0) return "";
  const total = totalLetters(lengths);
  return `${total} letter${total !== 1 ? "s" : ""}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DrawingCanvas({ socket, roomCode }: DrawingCanvasProps) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const contextRef    = useRef<CanvasRenderingContext2D | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const chatEndRef    = useRef<HTMLDivElement>(null);

  const isDrawingRef   = useRef(false);
  const lastPointRef   = useRef<{ x: number; y: number } | null>(null);
  const strokeIdRef    = useRef<string>("");
  const myStrokeIdsRef = useRef<Set<string>>(new Set());

  const [canUndo,    setCanUndo   ] = useState(false);
  const [canvasSize, setCanvasSize] = useState(500);
  const [cursorPos,  setCursorPos ] = useState<{ x: number; y: number } | null>(null);
  const [isOnCanvas, setIsOnCanvas] = useState(false);
  const [chatInput,  setChatInput ] = useState("");
  const [localUsername, setLocalUsername] = useState("");
  const [copied, setCopied] = useState(false);

  // Round-end overlay local state
  const [showRoundEnd,    setShowRoundEnd   ] = useState(false);
  const [roundEndCountdown, setRoundEndCountdown] = useState<number>(GAME_CONFIG.ROUND_END_OVERLAY_DURATION_S);

  // Word-select local countdown (visual only — backend handles the timeout)
  const [localSelectTime, setLocalSelectTime] = useState<number>(GAME_CONFIG.WORD_SELECT_TIME);

  const {
    color, brushSize, eraserSize, tool, isConnected,
    setTool, setColor, setBrushSize, setEraserSize,
    players, chatMessages, wordHint, wordLengths, currentWord,
    timeLeft, isDrawer, currentDrawerName, gamePhase,
    roundNumber, maxRounds, hasGuessedCorrectly,
    username, setUsername, hostId, socketId,
    wordChoices, isSelectingWord, wordSelectTimeLeft,
    roundScoreDelta, maxPlayers,
  } = useDrawingStore();

  const copyRoomLink = () => {
    const url = `${window.location.origin}/${roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Username ────────────────────────────────────────────────────────────────
  const showUsernameOverlay = !username;

  const handleJoin = () => {
    const name = localUsername.trim();
    if (!name) return;
    setUsername(name);
    localStorage.setItem("playerUsername", name);
    if (socket) socket.emit("joinGame", { username: name, roomCode });
  };

  useEffect(() => {
    const saved = localStorage.getItem("playerUsername");
    if (saved) setUsername(saved);
  }, [setUsername]);

  useEffect(() => {
    if (!socket || !username) return;
    if (socket.connected) socket.emit("joinGame", { username, roomCode });
  }, [socket, username]);

  // ── Round-end overlay timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (gamePhase !== "roundEnd") {
      setShowRoundEnd(false);
      return;
    }
    setShowRoundEnd(true);
    setRoundEndCountdown(GAME_CONFIG.ROUND_END_OVERLAY_DURATION_S);

    const interval = setInterval(() => {
      setRoundEndCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); setShowRoundEnd(false); return 0; }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gamePhase]);

  // ── Word-select countdown (local visual timer) ──────────────────────────────
  useEffect(() => {
    if (!isSelectingWord) return;
    setLocalSelectTime(wordSelectTimeLeft || GAME_CONFIG.WORD_SELECT_TIME);

    const interval = setInterval(() => {
      setLocalSelectTime((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSelectingWord, wordSelectTimeLeft]);

  // ── Auto-scroll chat ────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Canvas size ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const update = () => {
      const { width, height } = wrap.getBoundingClientRect();
      setCanvasSize(Math.max(Math.floor(Math.min(width - 24, height - 24)), 200));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // ── Canvas init (runs once) ─────────────────────────────────────────────────
  // The canvas resolution is fixed at CANVAS_RESOLUTION × CANVAS_RESOLUTION.
  // CSS width/height (canvasSize) scales the display without changing the
  // coordinate space, so all clients share the same 0–800 drawing grid.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width  = CANVAS_RESOLUTION;
    canvas.height = CANVAS_RESOLUTION;
    ctx.lineCap   = "round";
    ctx.lineJoin  = "round";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);

    contextRef.current = ctx;
  }, []); // empty deps — run once only, resolution never changes

  // ── Drawing primitives ──────────────────────────────────────────────────────
  const paintSegment = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number },
     type: string, segColor: string, segSize: number) => {
      const ctx = contextRef.current;
      if (!ctx) return;
      ctx.globalCompositeOperation = "source-over";
      const drawColor = type === "erase" ? "#FFFFFF" : segColor;

      if (from.x === to.x && from.y === to.y) {
        // Single click — draw a filled circle so it's always visible
        ctx.fillStyle = drawColor;
        ctx.beginPath();
        ctx.arc(from.x, from.y, segSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = drawColor;
        ctx.lineWidth   = segSize;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }, []
  );

  const floodFill = useCallback(
    (startX: number, startY: number, fillColor: string) => {
      const canvas = canvasRef.current;
      const ctx    = contextRef.current;
      if (!canvas || !ctx) return;

      const { width, height } = canvas;
      const imageData = ctx.getImageData(0, 0, width, height);
      const data      = imageData.data;

      const sx = Math.round(startX);
      const sy = Math.round(startY);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;

      // Sample the colour at the click point
      const pi = (sy * width + sx) * 4;
      const tR = data[pi], tG = data[pi + 1], tB = data[pi + 2], tA = data[pi + 3];

      // Parse fill colour
      const fR = parseInt(fillColor.slice(1, 3), 16);
      const fG = parseInt(fillColor.slice(3, 5), 16);
      const fB = parseInt(fillColor.slice(5, 7), 16);

      // Already the fill colour — nothing to do
      if (
        Math.abs(tR - fR) < 5 &&
        Math.abs(tG - fG) < 5 &&
        Math.abs(tB - fB) < 5 &&
        tA === 255
      ) return;

      // ── Tolerance-based colour match ─────────────────────────────────────
      // Each channel of the sampled pixel must be within TOLERANCE of the
      // target.  A value of 32 (matching Photoshop/Paint defaults) is enough
      // to absorb anti-aliased edge pixels — the semi-transparent grey fringe
      // that forms where a brush stroke meets the white canvas — without
      // leaking through solid lines (which differ by ~200+ per channel).
      const T = 32;
      const matches = (idx: number) =>
        Math.abs(data[idx]     - tR) <= T &&
        Math.abs(data[idx + 1] - tG) <= T &&
        Math.abs(data[idx + 2] - tB) <= T &&
        Math.abs(data[idx + 3] - tA) <= T;

      // ── Scanline span-fill ────────────────────────────────────────────────
      // Processes pixels row-by-row (cache-friendly).  For each span it
      // records a single entry point for the row above and below rather than
      // enqueuing every pixel individually — ~10× faster than 4-connected BFS
      // and produces a visually uniform fill with no depth-first "streaking".
      const filled = new Uint8Array(width * height); // 0 = unfilled, 1 = filled

      // Stack stores flat pixel indices
      const stack: number[] = [sy * width + sx];

      while (stack.length) {
        let f = stack.pop()!;
        const rowY = (f / width) | 0;
        let   colX = f % width;

        // Walk left to the beginning of this horizontal span
        while (colX > 0 && matches((rowY * width + colX - 1) * 4) && !filled[rowY * width + colX - 1]) {
          colX--;
        }

        // Walk right, filling each pixel and noting span entries above/below
        let seedAbove = false;
        let seedBelow = false;

        while (colX < width) {
          const flat = rowY * width + colX;
          const idx  = flat * 4;
          if (!matches(idx) || filled[flat]) break;

          // Fill this pixel
          filled[flat]  = 1;
          data[idx]     = fR;
          data[idx + 1] = fG;
          data[idx + 2] = fB;
          data[idx + 3] = 255;

          // Row above
          if (rowY > 0) {
            const af = flat - width;
            if (matches(af * 4) && !filled[af]) {
              if (!seedAbove) { stack.push(af); seedAbove = true; }
            } else {
              seedAbove = false; // gap in span — reset so next continuous run gets its own seed
            }
          }

          // Row below
          if (rowY < height - 1) {
            const bf = flat + width;
            if (matches(bf * 4) && !filled[bf]) {
              if (!seedBelow) { stack.push(bf); seedBelow = true; }
            } else {
              seedBelow = false;
            }
          }

          colX++;
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }, []
  );

  const applyDrawEvent = useCallback((event: any) => {
    if (event.type === "stroke" || event.type === "erase") {
      paintSegment(
        { x: event.startX, y: event.startY },
        { x: event.endX,   y: event.endY   },
        event.type, event.color ?? "#000000", event.size ?? 5
      );
    } else if (event.type === "fill") {
      floodFill(event.x, event.y, event.color ?? "#000000");
    }
  }, [paintSegment, floodFill]);

  const replayHistory = useCallback((history: any[]) => {
    const canvas = canvasRef.current, ctx = contextRef.current;
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    history.forEach((ev) => applyDrawEvent(ev));
  }, [applyDrawEvent]);

  // ── Socket drawing events ───────────────────────────────────────────────────
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

  // ── Canvas coordinate helpers ───────────────────────────────────────────────

  /** Convert a mouse event position → canvas logical coordinates (0–CANVAS_RESOLUTION) */
  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top ) * (canvas.height / rect.height),
    };
  };

  /** Convert a mouse event position → CSS display coordinates (for the cursor overlay) */
  const getCSSPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Convert a Touch → canvas logical coordinates (same scale as getCanvasPoint) */
  const getTouchCanvasPoint = (touch: React.Touch) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) * (canvas.width  / rect.width),
      y: (touch.clientY - rect.top ) * (canvas.height / rect.height),
    };
  };

  // ── Shared drawing logic (used by both mouse and touch handlers) ────────────

  const startStroke = (pt: { x: number; y: number }) => {
    if (!socket || !isDrawer) return;
    const sid = `${socket.id}-${Date.now()}`;

    if (tool === "fill") {
      floodFill(pt.x, pt.y, color);
      socket.emit("draw", { type: "fill", x: pt.x, y: pt.y, color, timestamp: Date.now(), clientId: socket.id, strokeId: sid });
      myStrokeIdsRef.current.add(sid);
      setCanUndo(true);
      return;
    }

    isDrawingRef.current  = true;
    lastPointRef.current  = pt;
    strokeIdRef.current   = sid;
    myStrokeIdsRef.current.add(sid);
    setCanUndo(true);

    // Dot on click/tap so single touches always leave a visible mark
    const isErase  = tool === "eraser";
    const segColor = isErase ? "#FFFFFF" : color;
    const segSize  = isErase ? eraserSize : brushSize;
    paintSegment(pt, pt, isErase ? "erase" : "stroke", segColor, segSize);
    socket.emit("draw", {
      type: isErase ? "erase" : "stroke",
      startX: pt.x, startY: pt.y,
      endX:   pt.x, endY:   pt.y,
      color: segColor, size: segSize,
      timestamp: Date.now(), clientId: socket.id,
      strokeId: sid,
    });
  };

  const continueStroke = (pt: { x: number; y: number }) => {
    if (!isDrawingRef.current || !socket || !lastPointRef.current || !isDrawer) return;
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

  // ── Mouse handlers ──────────────────────────────────────────────────────────
  const handleMouseDown  = (e: React.MouseEvent<HTMLCanvasElement>) => startStroke(getCanvasPoint(e));
  const handleMouseMove  = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setCursorPos(getCSSPoint(e));
    continueStroke(getCanvasPoint(e));
  };
  const handleMouseUp    = endStroke;
  const handleMouseLeave = () => { setIsOnCanvas(false); setCursorPos(null); endStroke(); };

  // ── Touch handlers (mobile drawing) ────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // stop page scroll / zoom while drawing
    const touch = e.touches[0];
    if (touch) startStroke(getTouchCanvasPoint(touch));
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) continueStroke(getTouchCanvasPoint(touch));
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    endStroke();
  };

  // ── Toolbar actions ─────────────────────────────────────────────────────────
  const handleUndo = () => {
    if (!socket || !canUndo) return;
    socket.emit("undo", { clientId: socket.id });
    setCanUndo(false);
  };
  const handleClear = () => { if (!socket) return; socket.emit("clear"); };

  // ── Word selection ──────────────────────────────────────────────────────────
  const handleSelectWord = (index: number) => {
    if (!socket) return;
    socket.emit("selectWord", { choiceIndex: index });
  };

  // ── Chat / Guess ────────────────────────────────────────────────────────────
  const sendChatMessage = () => {
    const text = chatInput.trim();
    if (!text || !socket || hasGuessedCorrectly) return;
    socket.emit("guess", { text, clientId: socket.id });
    setChatInput("");
  };
  const handleChatKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") sendChatMessage();
  };

  // ── Derived display values ──────────────────────────────────────────────────
  const timerClass  = timeLeft <= 10 ? "urgent" : timeLeft <= 20 ? "ok" : "good";
  const selectClass = localSelectTime <= 5 ? "urgent" : localSelectTime <= 9 ? "ok" : "good";
  const cursorSize  = tool === "eraser" ? eraserSize : brushSize;
  const canDraw     = isDrawer && gamePhase === "drawing";

  // Sort players by score for the round-end overlay
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const deltaMap      = new Map(roundScoreDelta.map((d) => [d.id, d.delta]));

  // Progress bar fill % for round-end auto-close
  const roundEndProgress = (roundEndCountdown / GAME_CONFIG.ROUND_END_OVERLAY_DURATION_S) * 100;

  // ── Render ──────────────────────────────────────────────────────────────────
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

          {/* Center: timer + word hint side by side */}
          <div className="gf-topbar-center">
            {gamePhase === "drawing" && (
              <div className="gf-timer-wrap">
                <span style={{ fontSize: 16 }}>⏱</span>
                <span className={`gf-timer-num ${timerClass}`}>{timeLeft}</span>
                <span className="gf-timer-label">sec</span>
              </div>
            )}

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
                    {wordLengths.length > 0 && (
                      <span className="gf-word-char-count">({hintCountLabel(wordLengths)})</span>
                    )}
                  </>
                )
              ) : gamePhase === "roundEnd" ? (
                <>
                  <span className="gf-word-label">Word was:</span>
                  <span className="gf-word-drawing">{wordHint}</span>
                </>
              ) : gamePhase === "selectingWord" ? (
                <span className="gf-word-label">
                  {isDrawer ? "⏳ Choose your word…" : `⏳ ${currentDrawerName} is choosing…`}
                </span>
              ) : (
                <span className="gf-word-label">
                  {gamePhase === "waiting"  ? "⏳ Waiting for players…" :
                   gamePhase === "starting" ? "🎮 Game starting…" :
                   gamePhase === "gameEnd"  ? "🏆 Game Over!" : ""}
                </span>
              )}
            </div>
          </div>

          {roomCode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {/* <div style={{
                background: 'var(--cream)',
                border: '2.5px solid var(--ink)',
                borderRadius: '8px',
                padding: '6px 14px',
                fontFamily: "'Fredoka One', cursive",
                fontSize: '0.9rem',
                fontWeight: 700,
                color: 'var(--ink)',
                boxShadow: '3px 3px 0 var(--ink)',
                letterSpacing: '1px',
                whiteSpace: 'nowrap',
              }}>
                🔑 {roomCode}
              </div> */}
              <button
                className={`gf-copy-btn${copied ? ' copied' : ''}`}
                onClick={copyRoomLink}
                title="Copy room link to clipboard"
              >
                {copied
                  ? <>✓ Copied!</>
                  : <><Copy size={12} /> Share</>
                }
              </button>
            </div>
          )}

          {roundNumber > 0 && (
            <div className="gf-round-badge">Round {roundNumber}/{maxRounds}</div>
          )}

          <div className="gf-conn">
            <div className={`gf-conn-dot ${isConnected ? "on" : "off"}`} />
            <span style={{ color: isConnected ? "var(--green-dark)" : "var(--red)" }}>
              {isConnected ? "Connected" : "Offline"}
            </span>
          </div>

        </div>

        {/* ── Players panel ── */}
        <div className="gf-players">
          <div className="gf-panel-title">👥 Players ({players.length}/{maxPlayers})</div>
          <div className="gf-player-list">
            {players.length === 0 ? (
              <div style={{ padding: "12px 8px", color: "#aaa", fontSize: "0.8rem", fontWeight: 700, textAlign: "center" }}>
                No players yet...
              </div>
            ) : (
              sortedPlayers.map((p, i) => (
                <div
                  key={p.id}
                  className={`gf-player-row ${p.isDrawing ? "drawing" : ""} ${p.hasGuessed && !p.isDrawing ? "guessed" : ""}`}
                >
                  <div className="gf-player-avatar">{p.username[0]?.toUpperCase() ?? "?"}</div>
                  <div className="gf-player-name">
                    {p.username}
                    {p.id === hostId ? <span style={{ fontSize: '0.75rem', marginLeft: '4px', color: 'var(--gold)' }}>(host)</span> : null}
                  </div>
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
            <div className="gf-canvas-container" style={{ width: canvasSize, height: canvasSize }}>

              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onMouseEnter={() => setIsOnCanvas(true)}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="gf-canvas-touch"
                style={{
                  display: "block",
                  width: canvasSize, height: canvasSize,
                  cursor: canDraw ? "none" : "default",
                  borderRadius: 2,
                }}
              />

              {/* Custom cursor */}
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

              {/* ── Word selector overlay (drawer only) ── */}
              {isSelectingWord && isDrawer && (
                <div className="gf-word-select-overlay">
                  <div className="gf-word-select-title">Choose your word!</div>
                  <div className="gf-word-select-sub">Others will try to guess what you draw</div>

                  <div className="gf-word-choices">
                    {wordChoices.map((word, idx) => (
                      <button
                        key={idx}
                        className="gf-word-choice-btn"
                        onClick={() => handleSelectWord(idx)}
                      >
                        <span className="gf-word-choice-label">{word.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>

                  <div className={`gf-select-timer ${selectClass}`}>
                    ⏱ {localSelectTime}s
                  </div>
                  <div className="gf-select-hint">
                    Auto-picks randomly if time runs out
                  </div>
                </div>
              )}

              {/* ── Waiting for word overlay (non-drawers) ── */}
              {isSelectingWord && !isDrawer && (
                <div className="gf-canvas-overlay">
                  <div className="gf-overlay-text">
                    🤔<br/>
                    {currentDrawerName || "The drawer"}<br/>
                    is choosing a word…
                  </div>
                </div>
              )}

              {/* ── Round-end score overlay ── */}
              {showRoundEnd && (
                <div className="gf-round-end-overlay">
                  <div className="gf-round-end-title">⏰ Round Over!</div>
                  <div className="gf-round-end-word">The word was: {wordHint}</div>

                  <div className="gf-round-end-scores">
                    {sortedPlayers.map((p, i) => {
                      const delta = deltaMap.get(p.id) ?? 0;
                      return (
                        <div key={p.id} className="gf-round-end-row">
                          <div className="gf-round-end-rank">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`}
                          </div>
                          <div className="gf-round-end-name">{p.username}</div>
                          <div className="gf-round-end-total">{p.score}</div>
                          <div className={`gf-round-end-delta ${delta > 0 ? "positive" : "zero"}`}>
                            {delta > 0 ? `+${delta}` : "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="gf-round-end-auto-close">
                    <span>Next round in {roundEndCountdown}s</span>
                    <div className="gf-round-end-auto-bar">
                      <div
                        className="gf-round-end-auto-fill"
                        style={{ width: `${roundEndProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Phase overlays (waiting / starting / game end) ── */}
              {gamePhase === "waiting" && !isSelectingWord && !showRoundEnd && (
                <div className="gf-canvas-overlay">
                  <div className="gf-overlay-content" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '20px',
                  }}>
                    <div className="gf-overlay-text" style={{ marginBottom: '10px' }}>
                      ⏳ Waiting for players…
                    </div>
                    
                    <div style={{
                      background: 'rgba(255, 253, 244, 0.95)',
                      border: '3px solid #1a1a2e',
                      borderRadius: '12px',
                      padding: '16px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      minWidth: '200px',
                    }}>
                      <div style={{
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        color: '#1a1a2e',
                        marginBottom: '12px',
                        textAlign: 'center',
                      }}>
                        Players Joined ({players.length})
                      </div>
                      {players.map((player) => (
                        <div key={player.id} style={{
                          fontSize: '0.85rem',
                          padding: '6px 0',
                          color: '#1a1a2e',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}>
                          {player.id === hostId ? '👑' : '👤'}
                          <span>
                            {player.username}
                            {player.id === hostId ? <span style={{ fontSize: '0.75rem', marginLeft: '4px', color: '#c49430' }}> (host)</span> : null}
                          </span>
                        </div>
                      ))}
                    </div>

                    {socketId === hostId && (
                      <button
                        onClick={() => socket?.emit('startGame')}
                        style={{
                          background: '#3db870',
                          color: '#fff',
                          border: '2.5px solid #1a1a2e',
                          borderRadius: '8px',
                          padding: '10px 20px',
                          fontFamily: "'Fredoka One', cursive",
                          fontSize: '1rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: '4px 4px 0 #1a1a2e',
                          transition: 'all 0.1s',
                        }}
                        onMouseDown={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.boxShadow = '2px 2px 0 #1a1a2e';
                          (e.currentTarget as HTMLButtonElement).style.transform = 'translate(2px, 2px)';
                        }}
                        onMouseUp={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.boxShadow = '4px 4px 0 #1a1a2e';
                          (e.currentTarget as HTMLButtonElement).style.transform = 'translate(0, 0)';
                        }}
                      >
                        🚀 Start Game
                      </button>
                    )}
                  </div>
                </div>
              )}
              {gamePhase === "starting" && (
                <div className="gf-canvas-overlay">
                  <div className="gf-overlay-text">🎮<br/>Game starting!</div>
                </div>
              )}
              {gamePhase === "gameEnd" && (
                <div className="gf-game-end-overlay">
                  <div className="gf-game-end-title">🏆 Game Over!</div>
                  <div className="gf-game-end-subtitle">Final Scores</div>
              
                  <div className="gf-game-end-scores">
                    {sortedPlayers.map((p, i) => (
                      <div
                        key={p.id}
                        className={`gf-game-end-row${i === 0 ? " winner" : ""}`}
                      >
                        <div className="gf-game-end-rank">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
                        </div>
                        <div className="gf-game-end-name">
                          {p.username}
                          {i === 0 && (
                            <span style={{ fontSize: "0.7rem", marginLeft: 6, color: "var(--gold)" }}>
                              winner!
                            </span>
                          )}
                        </div>
                        <div className="gf-game-end-pts">{p.score} pts</div>
                      </div>
                    ))}
                  </div>
              
                  {socketId === hostId ? (
                    <button
                      className="gf-game-end-restart"
                      onClick={() => socket?.emit("restartGame")}
                    >
                      🔄 Play Again
                    </button>
                  ) : (
                    <div className="gf-game-end-waiting">
                      Waiting for host to restart…
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* ── Drawing toolbar ── */}
          <div className="gf-toolbar">
            <button className={`gf-tool-btn ${tool==="brush" ? "active" : ""}`} onClick={() => setTool("brush")} disabled={!canDraw} title="Brush">
              <Paintbrush size={15} /> Brush
            </button>
            <button className={`gf-tool-btn ${tool==="fill" ? "active" : ""}`} onClick={() => setTool("fill")} disabled={!canDraw} title="Fill">
              <Droplet size={15} /> Fill
            </button>
            <button className={`gf-tool-btn ${tool==="eraser" ? "active" : ""}`} onClick={() => setTool("eraser")} disabled={!canDraw} title="Eraser">
              <Eraser size={15} /> Eraser
            </button>

            <div className="gf-divider-v" />

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

            <div className="gf-color-grid">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`gf-color-swatch ${color===c && tool!=="eraser" ? "selected" : ""}`}
                  style={{ background: c }}
                  title={c}
                  disabled={!canDraw}
                  onClick={() => { setColor(c); if (tool !== "brush" && tool !== "fill") setTool("brush"); }}
                />
              ))}
            </div>

            <div className="gf-divider-v" />

            <button className="gf-tool-btn" onClick={handleUndo} disabled={!canDraw || !canUndo} title="Undo">
              <RotateCcw size={15} /> Undo
            </button>
            <button className="gf-tool-btn danger" onClick={handleClear} disabled={!canDraw} title="Clear canvas">
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
            <div className="gf-chat-input-row">
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
              {!isDrawer && !hasGuessedCorrectly && gamePhase === "drawing" && (
                <span className={`gf-chat-char-count ${
                  chatInput.replace(/ /g, "").length >= 80 ? "full" :
                  chatInput.replace(/ /g, "").length >= 60 ? "warn" : ""
                }`}>
                  {chatInput.replace(/ /g, "").length} chars
                </span>
              )}
            </div>
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