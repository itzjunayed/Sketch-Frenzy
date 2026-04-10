import { Pool, PoolClient } from "pg";

let pool: Pool | null = null;

export async function connectDB(): Promise<Pool | null> {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn("⚠ DATABASE_URL not set — PostgreSQL disabled (game still works without it)");
    return null;
  }

  try {
    pool = new Pool({ connectionString, ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false });
    await pool.query("SELECT 1");
    console.log("✓ PostgreSQL connected");
    return pool;
  } catch (err) {
    console.warn("⚠ PostgreSQL connection failed — continuing without DB:", (err as Error).message);
    pool = null;
    return null;
  }
}

export async function upsertUser(
  db: Pool,
  userId: string,
  fingerprint: string,
  ipAddress: string,
  username: string = "unknown"
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO users (id, username, device_fingerprint, ip_address, created_at, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
       SET last_seen_at = NOW(),
           ip_address = EXCLUDED.ip_address,
           device_fingerprint = EXCLUDED.device_fingerprint`,
      [userId, username.slice(0, 8), fingerprint, ipAddress]
    );
  } catch (err) {
    console.error("upsertUser error:", (err as Error).message);
  }
}

export async function recordRoomAssignment(
  db: Pool,
  roomCode: string,
  hostUserId: string,
  maxPlayers: number,
  rounds: number,
  drawTimeSecs: number
): Promise<void> {
  try {
    await db.query(
      `UPDATE rooms
       SET status = 'assigned',
           host_user_id = $2,
           max_players = $3,
           rounds = $4,
           draw_time_seconds = $5,
           assigned_at = NOW(),
           last_activity_at = NOW()
       WHERE room_code = $1`,
      [roomCode, hostUserId, maxPlayers, rounds, drawTimeSecs]
    );
  } catch (err) {
    console.error("recordRoomAssignment error:", (err as Error).message);
  }
}

export async function recordRoomPlayer(
  db: Pool,
  roomCode: string,
  userId: string,
  isHost: boolean
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO room_players (id, room_id, user_id, join_order, joined_at, is_active, is_host)
       SELECT gen_random_uuid(), r.id, $2,
              (SELECT COALESCE(MAX(join_order), 0) + 1 FROM room_players WHERE room_id = r.id),
              NOW(), true, $3
       FROM rooms r WHERE r.room_code = $1
       ON CONFLICT DO NOTHING`,
      [roomCode, userId, isHost]
    );
  } catch (err) {
    console.error("recordRoomPlayer error:", (err as Error).message);
  }
}

export async function recordRoundStart(
  db: Pool,
  roomCode: string,
  roundNumber: number,
  drawerUserId: string,
  word: string
): Promise<string | null> {
  try {
    const res = await db.query(
      `INSERT INTO rounds (id, room_id, round_number, drawer_user_id, word, started_at)
       SELECT gen_random_uuid(), r.id, $2, $3, $4, NOW()
       FROM rooms r WHERE r.room_code = $1
       RETURNING id`,
      [roomCode, roundNumber, drawerUserId, word]
    );
    return res.rows[0]?.id ?? null;
  } catch (err) {
    console.error("recordRoundStart error:", (err as Error).message);
    return null;
  }
}

export async function recordGuess(
  db: Pool,
  roundId: string,
  userId: string,
  guessText: string,
  isCorrect: boolean,
  scoreAwarded: number
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO guesses (id, round_id, user_id, guess_text, is_correct, guessed_at, score_awarded)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), $5)`,
      [roundId, userId, guessText, isCorrect, scoreAwarded]
    );
  } catch (err) {
    console.error("recordGuess error:", (err as Error).message);
  }
}
