const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'waterbill.db');
const db = new Database(DB_PATH);

// --- Concurrency setup ---------------------------------------------------
// WAL mode lets many readers + one writer work at the same time instead of
// locking the whole file on every write. busy_timeout makes concurrent
// writers wait/retry briefly instead of throwing SQLITE_BUSY immediately.
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',      -- 'admin' | 'super_admin'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  water_free_limit_l REAL NOT NULL DEFAULT 2000,
  rate_per_litre     REAL NOT NULL DEFAULT 0.15,
  billing_cycle      TEXT NOT NULL DEFAULT 'Monthly',
  version            INTEGER NOT NULL DEFAULT 1,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buildings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  location    TEXT,
  image_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'Active',        -- Active | Maintenance
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS houses (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id       INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  house_number      TEXT NOT NULL,
  resident_name     TEXT,
  previous_reading  REAL NOT NULL DEFAULT 0,
  current_reading   REAL NOT NULL DEFAULT 0,
  free_limit_l      REAL NOT NULL DEFAULT 5000,
  rate_per_litre    REAL NOT NULL DEFAULT 0.20,
  status            TEXT NOT NULL DEFAULT 'Pending',  -- Paid | Pending
  notes             TEXT,
  version           INTEGER NOT NULL DEFAULT 1,        -- optimistic lock
  updated_by        INTEGER REFERENCES admins(id),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(building_id, house_number)
);

CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  house_id    INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  amount      REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Pending',  -- Paid | Pending
  paid_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- audit trail so concurrent edits by different admins are traceable
CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER REFERENCES admins(id),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   INTEGER,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (id) VALUES (1);
`);

// --- Migrations for columns added after initial release -------------------
// Uses PRAGMA table_info instead of a blind ALTER TABLE so re-running this
// file (e.g. every server restart) never errors out on an already-migrated
// database.
const houseColumns = db.prepare('PRAGMA table_info(houses)').all().map((c) => c.name);
if (!houseColumns.includes('phone_number')) {
  db.exec('ALTER TABLE houses ADD COLUMN phone_number TEXT');
}

module.exports = db;
