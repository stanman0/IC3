const express = require('express');
const router = express.Router();
const db = require('../db.js');

const TRADE_FIELDS = [
  'date', 'instrument', 'direction', 'session', 'outcome', 'rr',
  'entry_price', 'exit_price', 'stop_price', 'contracts',
  'htf_bias', 'setup', 'timeframe', 'narrative', 'execution_notes',
  'hindsight', 'ai_analysis', 'grade', 'grade_score', 'criteria_checked',
  'exec_entry', 'exec_mgmt', 'exec_patience', 'exec_rules', 'screenshot_paths'
];

// GET / — list all trades ordered by created_at DESC
router.get('/', (req, res) => {
  try {
    const trades = db.prepare('SELECT * FROM trades ORDER BY created_at DESC').all();
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — single trade by id
router.get('/:id', (req, res) => {
  try {
    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / — insert trade from req.body
router.post('/', (req, res) => {
  try {
    const fields = TRADE_FIELDS.filter(f => req.body[f] !== undefined);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(f => req.body[f]);

    const stmt = db.prepare(
      `INSERT INTO trades (${fields.join(', ')}) VALUES (${placeholders})`
    );
    const result = stmt.run(...values);

    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update trade by id
router.put('/:id', (req, res) => {
  try {
    const fields = TRADE_FIELDS.filter(f => req.body[f] !== undefined);
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => req.body[f]);

    const stmt = db.prepare(`UPDATE trades SET ${setClause} WHERE id = ?`);
    const result = stmt.run(...values, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — delete trade by id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
