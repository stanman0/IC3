// server/routes/ohlc.js
// ── IC3 OHLC Data Router ─────────────────────────────────────────────────────
//
// Three usage patterns:
//
//   1. Explicit contract:
//      GET /api/ohlc?symbol=ESM23&tf=5m&from=1686700800&to=1686787200
//
//   2. Date-based lookup (auto-resolves contract from roll calendar):
//      GET /api/ohlc?root=ES&date=2023-06-14&tf=5m&from=1686700800&to=1686787200
//
//   3. Continuous contract (stitches contracts via roll calendar for requested range):
//      GET /api/ohlc?root=ES&tf=5m&from=1686700800&to=1686787200
//
// Instrument mapping: MES→ES, MNQ→NQ, MYM→YM, M2K→RTY

const express  = require('express');
const router   = express.Router();
const path     = require('path');
const Database = require('better-sqlite3');
const { readParquet, aggregateBars, sessionDate } = require('../utils/parquetReader');

const DB_PATH      = path.join(__dirname, '../../data/ic3.db');
const PARQUET_BASE = path.join(__dirname, '../../data/parquet');

// TF -> minutes map
const TF_MINUTES = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };

// Micro → full-size root mapping (micros share the same parquet data)
const ROOT_MAP = { MES: 'ES', MNQ: 'NQ', MYM: 'YM', M2K: 'RTY' };
function resolveRoot(input) {
  const up = (input || '').toUpperCase();
  return ROOT_MAP[up] || up;
}

// ── Resolve which contract covers a given ISO date string ────────────────────
function resolveContract(db, root, isoDate) {
  const row = db.prepare(`
    SELECT raw_symbol, active_from, active_to, roll_date, parquet_path
    FROM contract_calendar
    WHERE root = ?
      AND active_from <= ?
      AND active_to   >= ?
    ORDER BY active_from DESC
    LIMIT 1
  `).get(root, isoDate, isoDate);
  return row || null;
}

// ── Detect if a time range crosses a roll boundary ──────────────────────────
function detectRollBoundary(db, root, fromTs, toTs) {
  const fromDate = new Date(fromTs * 1000).toISOString().slice(0, 10);
  const toDate   = new Date(toTs   * 1000).toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT raw_symbol, roll_date
    FROM contract_calendar
    WHERE root = ?
      AND roll_date >= ?
      AND roll_date <= ?
  `).all(root, fromDate, toDate);
  return rows;
}

// ── Find contracts that overlap a time range ────────────────────────────────
function findContractsInRange(db, root, fromDate, toDate) {
  return db.prepare(`
    SELECT raw_symbol, active_from, active_to, parquet_path
    FROM contract_calendar
    WHERE root = ?
      AND active_to >= ?
      AND active_from <= ?
    ORDER BY active_from ASC
  `).all(root, fromDate, toDate);
}

// ── Build continuous bars for a specific time range ─────────────────────────
// Only reads the parquet files that overlap the requested from/to window
async function buildContinuousRange(db, root, fromTs, toTs) {
  const fromDate = new Date(fromTs * 1000).toISOString().slice(0, 10);
  const toDate   = new Date(toTs   * 1000).toISOString().slice(0, 10);

  const contracts = findContractsInRange(db, root, fromDate, toDate);
  if (!contracts.length) return [];

  const allBars = [];
  for (const c of contracts) {
    if (!c.parquet_path) continue;
    try {
      const bars = await readParquet(c.parquet_path);
      for (const bar of bars) {
        // Only include bars within this contract's active window AND the requested range
        if (bar.time >= fromTs && bar.time <= toTs) {
          const sd = bar.session_date;
          if (sd >= c.active_from && sd <= c.active_to) {
            allBars.push(bar);
          }
        }
      }
    } catch (err) {
      console.warn(`[OHLC] Skipping ${c.raw_symbol}: ${err.message}`);
    }
  }

  allBars.sort((a, b) => a.time - b.time);
  return allBars;
}

// ── Latest-available timestamp for a root (used by datafeed fallback) ───────
router.get('/latest', async (req, res) => {
  let { root } = req.query;
  if (!root) return res.status(400).json({ error: 'root is required' });
  root = resolveRoot(root);

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    return res.status(500).json({ error: 'Database not available' });
  }

  try {
    const row = db.prepare(`
      SELECT parquet_path FROM contract_calendar
      WHERE root = ? AND parquet_path IS NOT NULL
      ORDER BY active_to DESC LIMIT 1
    `).get(root);
    if (!row) return res.status(404).json({ error: `No contracts for ${root}` });

    const bars = await readParquet(row.parquet_path);
    if (!bars.length) return res.json({ latest_sec: null });

    const latest = bars[bars.length - 1].time;
    return res.json({ latest_sec: latest });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// ── Main route handler ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  let { symbol, root, date, tf = '5m', from, to } = req.query;

  if (!tf || !TF_MINUTES[tf]) {
    return res.status(400).json({ error: `Invalid timeframe '${tf}'. Valid: ${Object.keys(TF_MINUTES).join(', ')}` });
  }

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to (Unix timestamps) are required' });
  }

  const fromTs = parseInt(from, 10);
  const toTs   = parseInt(to,   10);
  const tfMins = TF_MINUTES[tf];

  // Resolve micro → full-size root
  if (root) root = resolveRoot(root);

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    return res.status(500).json({ error: 'Database not available. Run seed_roll_calendar.py first.' });
  }

  try {
    // ── Mode 3: Continuous contract (root only, no date, no symbol) ──────
    if (root && !date && !symbol) {
      const bars1m = await buildContinuousRange(db, root, fromTs, toTs);
      const bars = tfMins === 1 ? bars1m : aggregateBars(bars1m, tfMins);

      // Include roll markers for the visible range
      const rollMarkers = detectRollBoundary(db, root, fromTs, toTs);

      return res.json({
        symbol:    root,
        timeframe: tf,
        continuous: true,
        bars,
        ...(rollMarkers.length > 0 && {
          roll_markers: rollMarkers.map(r => ({
            date:          r.roll_date,
            from_contract: r.raw_symbol,
            label:         `Roll: ${r.raw_symbol}`,
          }))
        })
      });
    }

    let contractSymbol, parquetPath, rollMarkers = [];

    if (symbol) {
      // Mode 1: Direct contract lookup
      const row = db.prepare('SELECT * FROM contract_calendar WHERE raw_symbol = ?').get(symbol);
      if (!row) return res.status(404).json({ error: `Contract '${symbol}' not found in calendar` });
      contractSymbol = symbol;
      parquetPath    = row.parquet_path;

    } else if (root && date) {
      // Mode 2: Date-based lookup
      const row = resolveContract(db, root, date);
      if (!row) return res.status(404).json({ error: `No contract found for ${root} on ${date}` });
      contractSymbol = row.raw_symbol;
      parquetPath    = row.parquet_path;

      rollMarkers = detectRollBoundary(db, root, fromTs, toTs);

    } else {
      return res.status(400).json({ error: 'Provide either symbol=, root= + date=, or root= alone for continuous' });
    }

    // Read and filter Parquet
    const allBars = await readParquet(parquetPath);
    const filtered = allBars.filter(b => b.time >= fromTs && b.time <= toTs);

    // Aggregate to requested timeframe
    const bars = tfMins === 1 ? filtered : aggregateBars(filtered, tfMins);

    return res.json({
      symbol:    contractSymbol,
      timeframe: tf,
      bars,
      ...(rollMarkers.length > 0 && {
        roll_markers: rollMarkers.map(r => ({
          date:          r.roll_date,
          from_contract: r.raw_symbol,
          label:         `Roll: ${r.raw_symbol}`,
        }))
      })
    });

  } catch (err) {
    console.error('[OHLC] Error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

module.exports = router;
