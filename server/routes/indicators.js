const express = require('express');
const router = express.Router();
const db = require('../db.js');

// GET /api/indicators/defaults?root=ES
router.get('/defaults', (req, res) => {
  const { root } = req.query;
  if (!root) return res.status(400).json({ error: 'root parameter required' });
  try {
    const row = db.prepare('SELECT config FROM indicator_defaults WHERE root = ?').get(root);
    res.json({ root, config: row?.config || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/indicators/defaults — save default indicator config for a symbol root
router.patch('/defaults', (req, res) => {
  const { root, config } = req.body;
  if (!root || config === undefined) return res.status(400).json({ error: 'root and config required' });
  try {
    db.prepare(`
      INSERT INTO indicator_defaults (root, config) VALUES (?, ?)
      ON CONFLICT(root) DO UPDATE SET config = excluded.config
    `).run(root, config);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
