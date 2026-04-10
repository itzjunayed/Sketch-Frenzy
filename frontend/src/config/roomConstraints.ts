/**
 * Room configuration and constraints
 * Centralized place to define all room settings limits and defaults
 */

export interface RoomConstraints {
  maxPlayers: {
    min: number;
    max: number;
    default: number;
  };
  rounds: {
    min: number;
    max: number;
    default: number;
  };
  roundTime: {
    options: number[];
    default: number;
  };
}

export const ROOM_CONSTRAINTS: RoomConstraints = {
  maxPlayers: {
    min: 2,
    max: 12,
    default: 8,
  },
  rounds: {
    min: 1,
    max: 10,
    default: 3,
  },
  roundTime: {
    options: [60, 90, 120],
    default: 60,
  },
};

// Helper function to validate room settings
export function validateRoomSettings(settings: {
  maxPlayers: number;
  rounds: number;
  roundTime: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (settings.maxPlayers < ROOM_CONSTRAINTS.maxPlayers.min || settings.maxPlayers > ROOM_CONSTRAINTS.maxPlayers.max) {
    errors.push(`Max players must be between ${ROOM_CONSTRAINTS.maxPlayers.min} and ${ROOM_CONSTRAINTS.maxPlayers.max}`);
  }

  if (settings.rounds < ROOM_CONSTRAINTS.rounds.min || settings.rounds > ROOM_CONSTRAINTS.rounds.max) {
    errors.push(`Rounds must be between ${ROOM_CONSTRAINTS.rounds.min} and ${ROOM_CONSTRAINTS.rounds.max}`);
  }

  if (!ROOM_CONSTRAINTS.roundTime.options.includes(settings.roundTime)) {
    errors.push(`Round time must be one of: ${ROOM_CONSTRAINTS.roundTime.options.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
