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

module.exports = db;
