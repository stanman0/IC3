const express = require('express')
const router = express.Router()

// Forex Factory publishes thisweek + nextweek calendar JSON
const FF_ENDPOINTS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
]

// GET /api/news?date=YYYY-MM-DD
// Returns USD High (red) and Medium (orange) events for the given date
router.get('/', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required' })

  try {
    let allEvents = []

    for (const url of FF_ENDPOINTS) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'IC3-Trading-Journal/1.0' },
          signal: AbortSignal.timeout(8000),
        })
        if (!response.ok) continue
        const events = await response.json()
        allEvents = allEvents.concat(events)
      } catch {
        // Skip unavailable endpoint
      }
    }

    // Filter: USD only, High or Medium impact, matching date (FF dates are ET)
    const filtered = allEvents.filter(e => {
      if (e.country !== 'USD') return false
      if (!['High', 'Medium'].includes(e.impact)) return false
      // Parse the date string — FF uses ISO with offset, e.g. "2024-01-05T08:30:00-0500"
      const eventDate = e.date ? e.date.slice(0, 10) : null
      return eventDate === date
    })

    // Sort by time
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date))

    res.json(filtered)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
