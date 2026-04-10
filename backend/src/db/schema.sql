-- Sketch Frenzy — PostgreSQL Schema
-- Run: psql -U postgres -d sketchfrenzy -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY,           -- matches localStorage UUID
  username          VARCHAR(8) NOT NULL DEFAULT 'unknown',
  device_fingerprint VARCHAR(64),               -- hashed UA+timezone+language
  ip_address        VARCHAR(64),
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Rooms ──────────────────────────────────────────────────────────────────────
CREATE TYPE room_status AS ENUM ('available', 'assigned', 'idle');

CREATE TABLE IF NOT EXISTS rooms (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code           VARCHAR(8) UNIQUE NOT NULL,
  status              room_status NOT NULL DEFAULT 'available',
  host_user_id        UUID REFERENCES users(id),
  max_players         INT,
  rounds              INT,
  draw_time_seconds   INT,
  assigned_at         TIMESTAMP,
  last_activity_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Pre-populate rooms (status = available) via application startup
-- Do not pre-populate here — let the backend handle it via preCreateRooms()

-- ── Room Players ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES rooms(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  join_order  INT NOT NULL,
  joined_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  left_at     TIMESTAMP,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_host     BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── Rounds ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES rooms(id),
  round_number    INT NOT NULL,
  drawer_user_id  UUID REFERENCES users(id),
  word            VARCHAR(100),
  started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMP
);

-- ── Guesses ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guesses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      UUID NOT NULL REFERENCES rounds(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  guess_text    VARCHAR(200) NOT NULL,
  is_correct    BOOLEAN NOT NULL DEFAULT FALSE,
  guessed_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  score_awarded INT NOT NULL DEFAULT 0
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rooms_code     ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status   ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rp_room        ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_rp_user        ON room_players(user_id);
CREATE INDEX IF NOT EXISTS idx_rounds_room    ON rounds(room_id);
CREATE INDEX IF NOT EXISTS idx_guesses_round  ON guesses(round_id);
