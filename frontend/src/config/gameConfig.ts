/**
 * Front-end game configuration — mirrors backend GAME_CONFIG.
 * Replace with server-pushed values once the backend sends them over the socket.
 */
export const GAME_CONFIG = {
  /** Seconds the overlay shows after a round ends before auto-closing */
  ROUND_END_OVERLAY_DURATION_S: 5,

  /** Seconds the word-selector overlay stays open */
  WORD_SELECT_TIME: 15,

  /** Number of word choices shown to the drawer */
  WORD_CHOICES_COUNT: 3,

  /** Max letters revealed as hints */
  MAX_HINT_REVEALS: 2,

  /** Total rounds (display only — server is authoritative) */
  MAX_ROUNDS: 3,

  /** Seconds per round (display only) */
  ROUND_TIME: 80,
} as const;
