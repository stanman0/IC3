import React, { useState, useEffect, useCallback } from 'react'
import MarkdownContent from '../components/MarkdownContent'

const WEEKLY_SYSTEM = `You are IC3 — a performance-focused ICT trading coach conducting a weekly review. You speak with authority and specificity. Reference ICT concepts by name. You grade honestly. Use ## for section headers. Use **bold** for ICT concept names.`

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return date.toISOString().split('T')[0]
}

function getSunday(mondayStr) {
  const d = new Date(mondayStr)
  d.setDate(d.getDate() + 6)
  return d.toISOString().split('T')[0]
}

export default function WeeklyTab({ settings }) {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [instrument, setInstrument] = useState('All')
  const [weekTrades, setWeekTrades] = useState([])
  const [loading, setLoading] = useState(false)
  const [best, setBest] = useState('')
  const [worst, setWorst] = useState('')
  const [narrative, setNarrative] = useState('')
  const [violations, setViolations] = useState('')
  const [patterns, setPatterns] = useState('')
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)

  const fetchWeekTrades = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trades')
      const all = await res.json()
      const sunday = getSunday(weekStart)
      const filtered = all.filter(t => {
        if (!t.date) return false
        if (t.date < weekStart || t.date > sunday) return false
        if (instrument !== 'All' && t.instrument !== instrument) return false
        return true
      })
      setWeekTrades(filtered)
    } catch (err) {
      console.error('Failed to fetch trades:', err)
      setWeekTrades([])
    }
    setLoading(false)
  }, [weekStart, instrument])

  useEffect(() => {
    fetchWeekTrades()
  }, [fetchWeekTrades])

  // Compute stats from trades
  const stats = (() => {
    const total = weekTrades.length
    const wins = weekTrades.filter(t => t.outcome && t.outcome.toLowerCase() === 'win').length
    const losses = weekTrades.filter(t => t.outcome && t.outcome.toLowerCase() === 'loss').length
    const be = total - wins - losses
    const pnl = weekTrades.reduce((sum, t) => sum + (parseFloat(t.rr) || 0), 0)
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
    const avgRR = total > 0 ? Math.round((pnl / total) * 100) / 100 : 0

    // Find best/worst by R:R
    let bestTrade = null
    let worstTrade = null
    for (const t of weekTrades) {
      const rr = parseFloat(t.rr)
      if (isNaN(rr)) continue
      if (!bestTrade || rr > parseFloat(bestTrade.rr)) bestTrade = t
      if (!worstTrade || rr < parseFloat(worstTrade.rr)) worstTrade = t
    }

    return { total, wins, losses, be, pnl: Math.round(pnl * 100) / 100, winRate, avgRR, bestTrade, worstTrade }
  })()

  const shiftWeek = (dir) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(d.toISOString().split('T')[0])
  }

  const formatTradeLabel = (t) => {
    if (!t) return 'N/A'
    return `${t.instrument} ${t.direction} — ${t.outcome} ${t.rr != null ? t.rr + 'R' : ''} (${t.setup || 'no setup'})`
  }

  const generateReview = async () => {
    setOutput('')
    setStreaming(true)

    const bestLabel = best || formatTradeLabel(stats.bestTrade)
    const worstLabel = worst || formatTradeLabel(stats.worstTrade)

    const userPrompt = `Generate a weekly trading review for an ICT-based futures trader:
Week: ${weekStart} | Instrument: ${instrument}
Stats: ${stats.total} trades | ${stats.wins}W/${stats.losses}L | ${stats.winRate}% win rate | ${stats.pnl}R
Best trade: ${bestLabel}
Worst: ${worstLabel}
Narrative: ${narrative || 'N/A'}
Violations: ${violations || 'N/A'}
Patterns: ${patterns || 'N/A'}

## Performance Summary
## Top 3 Strengths
## Top 3 Areas to Improve
## Pattern Alert
## Next Week's Focus
## Trader Grade: [A/B/C/D/F]

Under 400 words. Coach tone.`

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: WEEKLY_SYSTEM,
          messages: [{ role: 'user', content: userPrompt }]
        })
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                fullText += parsed.text
                setOutput(fullText)
              }
            } catch {}
          }
        }
      }
      setStreaming(false)
    } catch (err) {
      setOutput('Error: ' + err.message)
      setStreaming(false)
    }
  }

  return (
    <div>
      <div className="section-label">Week Selection</div>
      <div className="form-row cols-2">
        <div>
          <label>Week of</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={() => shiftWeek(-1)} style={{ padding: '6px 12px' }}>←</button>
            <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} />
            <button className="btn btn-ghost" onClick={() => shiftWeek(1)} style={{ padding: '6px 12px' }}>→</button>
          </div>
        </div>
        <div>
          <label>Instrument</label>
          <select value={instrument} onChange={e => setInstrument(e.target.value)}>
            {['All', ...(settings?.instruments || ['ES', 'NQ', 'YM', 'MES', 'MNQ'])].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{loading ? '...' : stats.total}</div>
          <div className="stat-label">Total Trades</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent2)' }}>{loading ? '...' : stats.wins}</div>
          <div className="stat-label">Wins</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{loading ? '...' : stats.losses}</div>
          <div className="stat-label">Losses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading ? '...' : stats.pnl + 'R'}</div>
          <div className="stat-label">Net P&L</div>
        </div>
      </div>

      {stats.total > 0 && (
        <div className="stats-row" style={{ marginTop: 0 }}>
          <div className="stat-card">
            <div className="stat-value">{stats.winRate}%</div>
            <div className="stat-label">Win Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.avgRR}R</div>
            <div className="stat-label">Avg R:R</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.be}</div>
            <div className="stat-label">BE / Scratch</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{weekTrades.filter(t => t.grade).length}</div>
            <div className="stat-label">Graded</div>
          </div>
        </div>
      )}

      <div className="form-row cols-2">
        <div>
          <label>Best Trade <span style={{ color: 'var(--muted)', fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>{stats.bestTrade ? '(auto-detected)' : ''}</span></label>
          <input
            value={best || (stats.bestTrade ? formatTradeLabel(stats.bestTrade) : '')}
            onChange={e => setBest(e.target.value)}
            placeholder={stats.bestTrade ? formatTradeLabel(stats.bestTrade) : 'Describe your best trade this week'}
          />
        </div>
        <div>
          <label>Worst Trade <span style={{ color: 'var(--muted)', fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>{stats.worstTrade ? '(auto-detected)' : ''}</span></label>
          <input
            value={worst || (stats.worstTrade ? formatTradeLabel(stats.worstTrade) : '')}
            onChange={e => setWorst(e.target.value)}
            placeholder={stats.worstTrade ? formatTradeLabel(stats.worstTrade) : 'Describe your worst trade this week'}
          />
        </div>
      </div>

      <div className="section-label">Weekly Narrative</div>
      <textarea rows={5} value={narrative} onChange={e => setNarrative(e.target.value)} placeholder="How did the week go overall?" />

      <div className="form-row cols-2" style={{ marginTop: 16 }}>
        <div>
          <label>Rule Violations</label>
          <textarea rows={3} value={violations} onChange={e => setViolations(e.target.value)} placeholder="Any rules broken?" />
        </div>
        <div>
          <label>Patterns Noticed</label>
          <textarea rows={3} value={patterns} onChange={e => setPatterns(e.target.value)} placeholder="Recurring themes?" />
        </div>
      </div>

      <div className="action-row">
        <button className="btn btn-primary" onClick={generateReview} disabled={streaming || stats.total === 0}>
          {streaming ? 'Generating...' : 'Generate Weekly Review'}
        </button>
        {stats.total === 0 && !loading && (
          <span className="status-msg" style={{ color: 'var(--muted)' }}>No trades found for this week</span>
        )}
      </div>

      {(output || streaming) && (
        <div className="output-container">
          <div className="output-header">
            <span className="output-title">Weekly Review</span>
            {streaming && <div className="spinner" />}
          </div>
          <div className="output-body">
            {streaming ? <>{output}<span className="cursor" /></> : <MarkdownContent>{output}</MarkdownContent>}
          </div>
        </div>
      )}
    </div>
  )
}
