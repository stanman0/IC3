const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Ensure data directories exist
fs.mkdirSync(path.join(__dirname, '..', 'data', 'screenshots'), { recursive: true });

const db = new Database(path.join(__dirname, '..', 'data', 'ic3.db'));

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now')),
    date TEXT,
    instrument TEXT,
    direction TEXT,
    session TEXT,
    outcome TEXT,
    rr REAL,
    entry_price REAL,
    exit_price REAL,
    stop_price REAL,
    contracts INTEGER,
    htf_bias TEXT,
    setup TEXT,
    timeframe TEXT,
    narrative TEXT,
    execution_notes TEXT,
    hindsight TEXT,
    ai_analysis TEXT,
    grade TEXT,
    grade_score INTEGER,
    criteria_checked TEXT,
    exec_entry INTEGER,
    exec_mgmt INTEGER,
    exec_patience INTEGER,
    exec_rules INTEGER,
    screenshot_paths TEXT
  );
`);

// Add psychology columns to trades (safe — SQLite ignores if column exists via try/catch)
const psychAlterations = [
  'ALTER TABLE trades ADD COLUMN pre_mood INTEGER',
  'ALTER TABLE trades ADD COLUMN pre_confidence INTEGER',
  'ALTER TABLE trades ADD COLUMN behaviors_noted TEXT',
  'ALTER TABLE trades ADD COLUMN mental_state TEXT',
  'ALTER TABLE trades ADD COLUMN belief TEXT',
  'ALTER TABLE trades ADD COLUMN psych_commitment TEXT',
]
for (const sql of psychAlterations) {
  try { db.exec(sql) } catch {}
}

db.exec(`
  CREATE TABLE IF NOT EXISTS premarket (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now')),
    date TEXT UNIQUE,
    session TEXT,
    htf_bias TEXT,
    mood INTEGER,
    confidence INTEGER,
    key_levels TEXT,
    narrative TEXT,
    setups_watching TEXT,
    game_plan TEXT,
    news_events TEXT,
    screenshot_paths TEXT,
    ai_analysis TEXT
  );
`);

// News/economic events cache table
db.exec(`
  CREATE TABLE IF NOT EXISTS news_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT,
    event_time TEXT,
    title TEXT,
    country TEXT,
    impact TEXT,
    forecast TEXT,
    previous TEXT,
    actual TEXT,
    source TEXT DEFAULT 'forex_factory',
    UNIQUE(event_date, title, event_time)
  );
`);

// Track when we last fetched news for a given week
db.exec(`
  CREATE TABLE IF NOT EXISTS news_fetch_log (
    week_start TEXT PRIMARY KEY,
    fetched_at TEXT DEFAULT (datetime('now'))
  );
`);

// Live session notes — timestamped intraday log per date
db.exec(`
  CREATE TABLE IF NOT EXISTS session_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now')),
    date TEXT,
    time TEXT,
    note TEXT,
    tag TEXT
  );
`);

// Session notes theme + structured capture columns
const sessionNotesAlterations = [
  'ALTER TABLE session_notes ADD COLUMN theme TEXT',
  'ALTER TABLE session_notes ADD COLUMN trade_phase TEXT',
  'ALTER TABLE session_notes ADD COLUMN direction TEXT',
  'ALTER TABLE session_notes ADD COLUMN conviction INTEGER',
  'ALTER TABLE session_notes ADD COLUMN intensity INTEGER',
  'ALTER TABLE session_notes ADD COLUMN state_tags TEXT',
  'ALTER TABLE session_notes ADD COLUMN setup_type TEXT',
  'ALTER TABLE session_notes ADD COLUMN price_level REAL',
  'ALTER TABLE session_notes ADD COLUMN reaction_expected TEXT',
  'ALTER TABLE session_notes ADD COLUMN invalidation_condition TEXT',
  'ALTER TABLE session_notes ADD COLUMN setup_validated TEXT',
  'ALTER TABLE session_notes ADD COLUMN premarket_candidate INTEGER DEFAULT 0',
]
for (const sql of sessionNotesAlterations) {
  try { db.exec(sql) } catch {}
}

// Post-session bias verdict on premarket
const premarketAlterations = [
  'ALTER TABLE premarket ADD COLUMN bias_verdict TEXT',
  'ALTER TABLE premarket ADD COLUMN bias_verdict_notes TEXT',
]
for (const sql of premarketAlterations) {
  try { db.exec(sql) } catch {}
}

module.exports = db;
