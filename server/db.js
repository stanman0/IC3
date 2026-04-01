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

module.exports = db;
