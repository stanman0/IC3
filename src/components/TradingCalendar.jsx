import React, { useMemo, useState } from 'react'

const POINT_VALUES = { ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5 }

function calcPnl(instrument, direction, entry, exit, contracts) {
  const pv = POINT_VALUES[instrument]
  if (!pv || !entry || !exit || !contracts) return null
  const points = direction === 'Long' ? exit - entry : entry - exit
  return Math.round(points * Number(contracts) * pv * 100) / 100
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_HEADERS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function fmt$(val) {
  const abs = Math.abs(val)
  if (abs >= 1000) return (val < 0 ? '-' : '+') + '$' + (abs / 1000).toFixed(1) + 'k'
  return (val >= 0 ? '+' : '-') + '$' + abs.toFixed(0)
}

export default function TradingCalendar({ trades, selectedDate, onDaySelect }) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  // Aggregate trades by date
  const dayData = useMemo(() => {
    const map = {}
    for (const trade of trades) {
      if (!trade.date) continue
      if (!map[trade.date]) map[trade.date] = { pnl: 0, count: 0, wins: 0, losses: 0, rrSum: 0, rrCount: 0 }
      const pnl = calcPnl(trade.instrument, trade.direction, trade.entry_price, trade.exit_price, trade.contracts)
      map[trade.date].pnl += pnl ?? 0
      map[trade.date].count++
      if (trade.outcome === 'Win') map[trade.date].wins++
      if (trade.outcome === 'Loss') map[trade.date].losses++
      if (trade.rr != null) { map[trade.date].rrSum += trade.rr; map[trade.date].rrCount++ }
    }
    // Round each day's pnl
    for (const d of Object.values(map)) d.pnl = Math.round(d.pnl * 100) / 100
    return map
  }, [trades])

  // Month stats
  const monthStats = useMemo(() => {
    let pnl = 0, count = 0, wins = 0, losses = 0
    for (const [date, data] of Object.entries(dayData)) {
      const [y, m] = date.split('-').map(Number)
      if (y === viewYear && m - 1 === viewMonth) {
        pnl += data.pnl
        count += data.count
        wins += data.wins
        losses += data.losses
      }
    }
    return { pnl: Math.round(pnl * 100) / 100, count, wins, losses }
  }, [dayData, viewYear, viewMonth])

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay() // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const todayStr = now.toISOString().split('T')[0]

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 14 }} onClick={prevMonth}>‹</button>
        <span style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 14 }} onClick={nextMonth}>›</button>
      </div>

      {/* Month stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Net P&L', value: monthStats.count > 0 ? ((monthStats.pnl >= 0 ? '+' : '') + '$' + Math.abs(monthStats.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : '—', color: monthStats.pnl > 0 ? 'var(--accent2)' : monthStats.pnl < 0 ? 'var(--danger)' : 'var(--muted)' },
          { label: 'Trades', value: monthStats.count || '—', color: 'var(--text)' },
          { label: 'Win Rate', value: monthStats.count > 0 ? Math.round((monthStats.wins / monthStats.count) * 100) + '%' : '—', color: 'var(--accent)' },
          { label: 'W / L', value: monthStats.count > 0 ? `${monthStats.wins} / ${monthStats.losses}` : '—', color: 'var(--text)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--sans)', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DAY_HEADERS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--mono)', padding: '2px 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />

          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const data = dayData[dateStr]
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const hasTrades = !!data

          let bg = 'var(--surface)'
          let borderColor = isSelected ? 'var(--accent)' : isToday ? 'var(--border2)' : 'var(--border)'
          if (hasTrades) {
            bg = data.pnl > 0
              ? 'rgba(79,201,126,0.08)'
              : data.pnl < 0
              ? 'rgba(232,92,92,0.08)'
              : 'var(--surface)'
            if (!isSelected) borderColor = data.pnl > 0 ? 'rgba(79,201,126,0.3)' : data.pnl < 0 ? 'rgba(232,92,92,0.3)' : 'var(--border)'
          }

          return (
            <div
              key={dateStr}
              onClick={() => onDaySelect(isSelected ? null : dateStr)}
              style={{
                background: bg,
                border: `1px solid ${borderColor}`,
                borderRadius: 6,
                padding: '6px 6px 5px',
                minHeight: 58,
                cursor: hasTrades ? 'pointer' : 'default',
                transition: 'border-color 0.15s',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: 10, color: isToday ? 'var(--accent)' : 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: 3, fontWeight: isToday ? 700 : 400 }}>{day}</div>
              {hasTrades && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', color: data.pnl > 0 ? 'var(--accent2)' : data.pnl < 0 ? 'var(--danger)' : 'var(--muted)', lineHeight: 1.2 }}>
                    {fmt$(data.pnl)}
                  </div>
                  {data.rrCount > 0 && (
                    <div style={{ fontSize: 9, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--muted)', marginTop: 1, lineHeight: 1.2 }}>
                      {(data.rrSum / data.rrCount).toFixed(2)}R
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                    {data.count} trade{data.count !== 1 ? 's' : ''}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
