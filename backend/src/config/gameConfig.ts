/**
 * Central game configuration.
 * All values here can be overridden via environment variables or a future
 * admin API — never hard-code these numbers elsewhere in the codebase.
 */
export const GAME_CONFIG = {
  /** Total rounds before the game ends */
  MAX_ROUNDS: 3,

  /** Seconds each drawer has to draw */
  ROUND_TIME: 80,

  /** How many word options are shown to the drawer before each turn */
  WORD_CHOICES_COUNT: 3,

  /** Seconds the drawer has to pick one of their word choices */
  WORD_SELECT_TIME: 15,

  /** Maximum letters revealed as hints to guessers during a round */
  MAX_HINT_REVEALS: 2,

  /** Milliseconds of pause between rounds (round-end overlay duration) */
  ROUND_END_PAUSE_MS: 5000,

  /** Milliseconds before the game fully resets after game-end */
  GAME_RESET_DELAY_MS: 10000,

  /** Minimum connected players required to start */
  MIN_PLAYERS: 2,

  /** Milliseconds of "Game starting…" countdown before first round */
  COUNTDOWN_DELAY_MS: 3000,
} as const;

export type GameConfig = typeof GAME_CONFIG;