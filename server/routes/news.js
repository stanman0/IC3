const express = require('express')
const router = express.Router()
const db = require('../db')

// Forex Factory endpoints — thisweek + nextweek
const FF_ENDPOINTS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
]

function getWeekMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

// Fetch from FF with rate-limit awareness
async function fetchFromFF() {
  let allEvents = []

  for (const url of FF_ENDPOINTS) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'TradeForge-Journal/1.0' },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) continue
      // FF returns HTML when rate-limited — check content-type
      const ct = response.headers.get('content-type') || ''
      if (!ct.includes('json')) {
        console.log('[news] FF rate-limited, skipping:', url.split('/').pop())
        continue
      }
      const events = await response.json()
      if (Array.isArray(events)) {
        allEvents = allEvents.concat(events)
      }
    } catch (err) {
      console.log('[news] FF fetch error:', err.message)
    }
  }

  return allEvents
}

// Cache events into SQLite
function cacheEvents(events) {
  if (!events.length) return 0

  const insert = db.prepare(`
    INSERT OR REPLACE INTO news_events (event_date, event_time, title, country, impact, forecast, previous, actual, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'forex_factory')
  `)

  const insertMany = db.transaction((evts) => {
    let count = 0
    for (const e of evts) {
      if (!e.date || !e.title) continue
      const eventDate = e.date.slice(0, 10)
      const eventTime = e.date.length > 10 ? e.date.slice(11, 16) : ''
      try {
        insert.run(eventDate, eventTime, e.title, e.country || '', e.impact || '', e.forecast || '', e.previous || '', e.actual || '')
        count++
      } catch {}
    }
    return count
  })

  const cached = insertMany(events)

  // Log which weeks we fetched
  const weeks = new Set()
  for (const e of events) {
    if (e.date) weeks.add(getWeekMonday(e.date.slice(0, 10)))
  }
  const logFetch = db.prepare('INSERT OR REPLACE INTO news_fetch_log (week_start, fetched_at) VALUES (?, datetime("now"))')
  for (const w of weeks) logFetch.run(w)

  return cached
}

function isCacheFresh(weekMonday, maxAgeHours = 6) {
  const row = db.prepare('SELECT fetched_at FROM news_fetch_log WHERE week_start = ?').get(weekMonday)
  if (!row) return false
  const fetchedAt = new Date(row.fetched_at + 'Z')
  return (Date.now() - fetchedAt.getTime()) < maxAgeHours * 3600000
}

function getEventsFromCache(date) {
  return db.prepare(`
    SELECT event_date, event_time, title, country, impact, forecast, previous, actual
    FROM news_events
    WHERE event_date = ? AND country = 'USD' AND impact IN ('High', 'Medium')
    ORDER BY event_time ASC
  `).all(date)
}

function formatEvents(rows) {
  return rows.map(e => ({
    date: `${e.event_date}T${e.event_time || '00:00'}:00-0500`,
    title: e.title,
    country: e.country,
    impact: e.impact,
    forecast: e.forecast || null,
    previous: e.previous || null,
    actual: e.actual || null,
  }))
}

// GET /api/news?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required' })

  try {
    const weekMonday = getWeekMonday(date)
    const today = new Date().toISOString().split('T')[0]
    const todayMonday = getWeekMonday(today)
    const nextWeekDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    const nextMonday = getWeekMonday(nextWeekDate)

    // Can we fetch live data for this week?
    const isFetchable = weekMonday === todayMonday || weekMonday === nextMonday

    // If fetchable and cache is stale, refresh
    if (isFetchable && !isCacheFresh(weekMonday)) {
      const events = await fetchFromFF()
      if (events.length > 0) {
        cacheEvents(events)
      }
    }

    // Always serve from cache
    const cached = getEventsFromCache(date)
    res.json(formatEvents(cached))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/news/refresh — Force refresh from FF (respects their rate limit)
router.post('/refresh', async (req, res) => {
  try {
    const events = await fetchFromFF()
    const count = events.length > 0 ? cacheEvents(events) : 0
    res.json({ fetched: events.length, cached: count, rateLimited: events.length === 0 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/news/manual — Manually add events (for historical data or when FF is unavailable)
router.post('/manual', (req, res) => {
  const { events } = req.body
  if (!Array.isArray(events)) return res.status(400).json({ error: 'events array required' })

  const insert = db.prepare(`
    INSERT OR REPLACE INTO news_events (event_date, event_time, title, country, impact, forecast, previous, actual, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')
  `)

  const insertMany = db.transaction((evts) => {
    let count = 0
    for (const e of evts) {
      if (!e.date || !e.title) continue
      try {
        insert.run(e.date, e.time || '', e.title, e.country || 'USD', e.impact || 'High', e.forecast || '', e.previous || '', e.actual || '')
        count++
      } catch {}
    }
    return count
  })

  const count = insertMany(events)
  res.json({ inserted: count })
})

// GET /api/news/stats
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM news_events').get()
  const usdHigh = db.prepare("SELECT COUNT(*) as count FROM news_events WHERE country = 'USD' AND impact = 'High'").get()
  const dateRange = db.prepare('SELECT MIN(event_date) as earliest, MAX(event_date) as latest FROM news_events').get()
  const weeks = db.prepare('SELECT COUNT(*) as count FROM news_fetch_log').get()
  res.json({
    total_events: total.count,
    usd_high_impact: usdHigh.count,
    earliest: dateRange.earliest,
    latest: dateRange.latest,
    weeks_cached: weeks.count,
  })
})

module.exports = router
