/**
 * Front-end game configuration.
 *
 * These values mirror the backend GAME_CONFIG so the UI can show timers
 * and countdowns without waiting for a server push.
 * When the backend starts sending config over the socket, replace the
 * constants below with values from the store instead.
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

  /** Total rounds (for display only — server is authoritative) */
  MAX_ROUNDS: 3,

  /** Seconds per round (for display only) */
  ROUND_TIME: 80,
} as const;