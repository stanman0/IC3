const express = require('express')
const router = express.Router()
const db = require('../db')

// GET by date
router.get('/', (req, res) => {
  const { date } = req.query
  if (!date) return res.json(null)
  const row = db.prepare('SELECT * FROM premarket WHERE date = ?').get(date)
  res.json(row || null)
})

// POST (upsert by date)
router.post('/', (req, res) => {
  const { date, session, htf_bias, mood, confidence, key_levels, narrative, setups_watching, game_plan, news_events, screenshot_paths, ai_analysis, bias_verdict, bias_verdict_notes } = req.body
  const existing = db.prepare('SELECT id FROM premarket WHERE date = ?').get(date)
  if (existing) {
    db.prepare(`UPDATE premarket SET session=?, htf_bias=?, mood=?, confidence=?, key_levels=?, narrative=?, setups_watching=?, game_plan=?, news_events=?, screenshot_paths=?, ai_analysis=?, bias_verdict=?, bias_verdict_notes=? WHERE id=?`)
      .run(session, htf_bias, mood, confidence, key_levels, narrative, setups_watching, game_plan, news_events, screenshot_paths, ai_analysis, bias_verdict, bias_verdict_notes, existing.id)
    return res.json(db.prepare('SELECT * FROM premarket WHERE id = ?').get(existing.id))
  }
  const result = db.prepare(`INSERT INTO premarket (date, session, htf_bias, mood, confidence, key_levels, narrative, setups_watching, game_plan, news_events, screenshot_paths, ai_analysis, bias_verdict, bias_verdict_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(date, session, htf_bias, mood, confidence, key_levels, narrative, setups_watching, game_plan, news_events, screenshot_paths, ai_analysis, bias_verdict, bias_verdict_notes)
  res.json(db.prepare('SELECT * FROM premarket WHERE id = ?').get(result.lastInsertRowid))
})

// PUT by id (partial update — for screenshot_paths or ai_analysis updates after save)
router.put('/:id', (req, res) => {
  const { id } = req.params
  const allowed = ['session', 'htf_bias', 'mood', 'confidence', 'key_levels', 'narrative', 'setups_watching', 'game_plan', 'news_events', 'screenshot_paths', 'ai_analysis', 'bias_verdict', 'bias_verdict_notes']
  const updates = allowed.filter(f => f in req.body)
  if (updates.length > 0) {
    const sets = updates.map(f => `${f}=?`).join(', ')
    const vals = updates.map(f => req.body[f])
    db.prepare(`UPDATE premarket SET ${sets} WHERE id=?`).run(...vals, id)
  }
  res.json(db.prepare('SELECT * FROM premarket WHERE id = ?').get(id))
})

module.exports = router
