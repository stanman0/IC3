import React, { useState, useEffect, useMemo } from 'react'

const POINT_VALUES = { ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5 }

function calcPnl(instrument, direction, entry, exit, contracts) {
  const pv = POINT_VALUES[instrument]
  if (!pv || !entry || !exit || !contracts) return null
  const points = direction === 'Long' ? exit - entry : entry - exit
  return Math.round(points * Number(contracts) * pv * 100) / 100
}

const SESSIONS = [
  { name: 'Asia', start: 20, end: 0 },       // 8pm - 12am ET
  { name: 'London', start: 2, end: 5 },       // 2am - 5am ET
  { name: 'NY AM', start: 8.5, end: 11 },     // 8:30am - 11am ET
  { name: 'NY PM', start: 13, end: 15 },      // 1pm - 3pm ET
]

function getCurrentSession() {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const h = et.getHours() + et.getMinutes() / 60
  for (const s of SESSIONS) {
    if (s.start > s.end) {
      if (h >= s.start || h < s.end) return s.name
    } else {
      if (h >= s.start && h < s.end) return s.name
    }
  }
  return null
}

export default function DailyStatsBar({ trades, maxRiskPerDay }) {
  const [session, setSession] = useState(getCurrentSession)

  useEffect(() => {
    const interval = setInterval(() => setSession(getCurrentSession()), 60000)
    return () => clearInterval(interval)
  }, [])

  const todayStr = new Date().toISOString().split('T')[0]

  const stats = useMemo(() => {
    const todayTrades = trades.filter(t => t.date === todayStr)
    let pnl = 0, count = todayTrades.length, wins = 0
    for (const t of todayTrades) {
      const p = calcPnl(t.instrument, t.direction, t.entry_price, t.exit_price, t.contracts)
      if (p != null) pnl += p
      if (t.outcome === 'Win') wins++
    }
    return { pnl: Math.round(pnl * 100) / 100, count, wins }
  }, [trades, todayStr])

  const riskUsed = useMemo(() => {
    if (!maxRiskPerDay) return null
    const todayTrades = trades.filter(t => t.date === todayStr)
    let totalRisk = 0
    for (const t of todayTrades) {
      const pv = POINT_VALUES[t.instrument]
      if (pv && t.entry_price && t.stop_price && t.contracts) {
        totalRisk += Math.abs(t.entry_price - t.stop_price) * Number(t.contracts) * pv
      }
    }
    return Math.round(totalRisk * 100) / 100
  }, [trades, todayStr, maxRiskPerDay])

  return (
    <div className="daily-stats-bar">
      <div className="stat-item">
        <span>Today</span>
        <span className="stat-val" style={{ color: stats.pnl > 0 ? 'var(--accent2)' : stats.pnl < 0 ? 'var(--danger)' : 'var(--text)' }}>
          {stats.count > 0 ? (stats.pnl >= 0 ? '+' : '') + '$' + Math.abs(stats.pnl).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
        </span>
      </div>
      <div className="stat-item">
        <span>Trades</span>
        <span className="stat-val" style={{ color: 'var(--text)' }}>{stats.count}</span>
      </div>
      {stats.count > 0 && (
        <div className="stat-item">
          <span>Wins</span>
          <span className="stat-val" style={{ color: 'var(--accent2)' }}>{stats.wins}</span>
        </div>
      )}
      {riskUsed != null && (
        <div className="stat-item">
          <span>Risk</span>
          <span className="stat-val" style={{ color: riskUsed > maxRiskPerDay ? 'var(--danger)' : 'var(--text)' }}>
            ${riskUsed} / ${maxRiskPerDay}
          </span>
        </div>
      )}
      {session && (
        <div className="session-badge">
          <span className="live-dot" />
          <span>{session}</span>
        </div>
      )}
    </div>
  )
}
