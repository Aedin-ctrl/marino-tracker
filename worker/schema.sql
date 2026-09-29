-- Marino Center / SquashBusters headcounts, one row per staff count.
CREATE TABLE IF NOT EXISTS rooms (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  facility TEXT NOT NULL,
  capacity INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS readings (
  room_id    TEXT NOT NULL,
  counted_at INTEGER NOT NULL,   -- unix seconds, when staff took the count
  count      INTEGER NOT NULL,
  PRIMARY KEY (room_id, counted_at)
);
CREATE INDEX IF NOT EXISTS readings_time ON readings (counted_at);
