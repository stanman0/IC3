const express = require('express')
const router = express.Router()
const db = require('../db')

// GET all notes for a date
router.get('/', (req, res) => {
  const { date } = req.query
  if (!date) return res.json([])
  const rows = db.prepare('SELECT * FROM session_notes WHERE date = ? ORDER BY time ASC, id ASC').all(date)
  res.json(rows)
})

// POST a new note
router.post('/', (req, res) => {
  const {
    date, time, note, tag, theme, trade_phase,
    direction, conviction, intensity, state_tags,
    setup_type, price_level, reaction_expected, invalidation_condition, setup_validated,
    premarket_candidate
  } = req.body
  if (!date || !note?.trim()) return res.status(400).json({ error: 'date and note required' })
  const result = db.prepare(`
    INSERT INTO session_notes
      (date, time, note, tag, theme, trade_phase, direction, conviction, intensity, state_tags,
       setup_type, price_level, reaction_expected, invalidation_condition, setup_validated, premarket_candidate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    date, time || null, note.trim(), tag || null, theme || null, trade_phase || null,
    direction || null, conviction || null, intensity || null,
    state_tags ? JSON.stringify(state_tags) : null,
    setup_type || null, price_level || null, reaction_expected || null,
    invalidation_condition || null,
    setup_validated || (theme === 'setup' ? 'PENDING' : null),
    premarket_candidate ? 1 : 0
  )
  res.json(db.prepare('SELECT * FROM session_notes WHERE id = ?').get(result.lastInsertRowid))
})

// PATCH — update setup_validated post-session
router.patch('/:id', (req, res) => {
  const { setup_validated } = req.body
  if (!setup_validated) return res.status(400).json({ error: 'setup_validated required' })
  db.prepare('UPDATE session_notes SET setup_validated = ? WHERE id = ?').run(setup_validated, req.params.id)
  res.json(db.prepare('SELECT * FROM session_notes WHERE id = ?').get(req.params.id))
})

// DELETE a note
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM session_notes WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
