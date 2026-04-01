import React, { useState, useRef } from 'react'
import { parseTradovateCsv } from '../utils/parseTradovateCsv'

const TIMEZONES = [
  { label: 'Eastern (ET/EST/EDT)', value: 'America/New_York' },
  { label: 'Central (CT/CST/CDT)', value: 'America/Chicago' },
  { label: 'Mountain (MT/MST/MDT)', value: 'America/Denver' },
  { label: 'Pacific (PT/PST/PDT)', value: 'America/Los_Angeles' },
]

export default function CsvImportModal({ onClose, onImported }) {
  const [timezone, setTimezone] = useState('America/Los_Angeles')
  const [parsedTrades, setParsedTrades] = useState(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  function parseFile(file, tz) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const trades = parseTradovateCsv(ev.target.result, tz)
        if (trades.length === 0) {
          setError('No completed trades found in this CSV. Partial/open positions at end of file are excluded.')
          setParsedTrades(null)
        } else {
          setParsedTrades(trades)
          setError('')
        }
      } catch (err) {
        setError('Failed to parse CSV: ' + err.message)
        setParsedTrades(null)
      }
    }
    reader.readAsText(file)
  }

  const handleFile = (e) => {
    parseFile(e.target.files[0], timezone)
  }

  const handleTimezoneChange = (e) => {
    setTimezone(e.target.value)
    if (fileRef.current?.files[0]) {
      parseFile(fileRef.current.files[0], e.target.value)
    }
  }

  const handleImport = async () => {
    if (!parsedTrades?.length) return
    setImporting(true)
    try {
      const res = await fetch('/api/trades/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: parsedTrades }),
      })
      if (!res.ok) throw new Error('Import failed')
      const { imported } = await res.json()
      onImported(imported)
    } catch (err) {
      setError(err.message)
      setImporting(false)
    }
  }

  return (
    <div className="import-overlay" onClick={onClose}>
      <div className="import-box" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
              Import Tradovate CSV
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              All times converted to Eastern (ET). Incomplete/open positions are excluded.
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div className="form-row cols-2" style={{ marginBottom: 0 }}>
          <div>
            <label>Timezone of Export</label>
            <select value={timezone} onChange={handleTimezoneChange}>
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Tradovate Orders CSV</label>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} />
          </div>
        </div>

        {error && (
          <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 12, fontFamily: 'var(--mono)' }}>
            {error}
          </div>
        )}

        {!parsedTrades && !error && (
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 16, fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
            Export from Tradovate: <span style={{ color: 'var(--text)' }}>Account &rarr; Activity &rarr; Orders &rarr; Export CSV</span>
          </div>
        )}

        {parsedTrades && (
          <>
            <div className="section-label" style={{ marginTop: 20 }}>
              {parsedTrades.length} trade{parsedTrades.length !== 1 ? 's' : ''} found
            </div>

            <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                    {['Date (ET)', 'Instrument', 'Direction', 'Contracts', 'Entry', 'Exit', 'Session', 'Outcome'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Entry' || h === 'Exit' ? 'right' : 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 400, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedTrades.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td style={{ padding: '5px 10px' }}>{t.instrument}</td>
                      <td style={{ padding: '5px 10px', color: t.direction === 'Long' ? 'var(--accent2)' : 'var(--danger)' }}>{t.direction}</td>
                      <td style={{ padding: '5px 10px' }}>{t.contracts}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{t.entry_price}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{t.exit_price}</td>
                      <td style={{ padding: '5px 10px' }}>{t.session}</td>
                      <td style={{ padding: '5px 10px', color: t.outcome === 'Win' ? 'var(--accent2)' : t.outcome === 'Loss' ? 'var(--danger)' : 'var(--muted)' }}>
                        {t.outcome}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? 'Importing...' : `Import ${parsedTrades.length} Trade${parsedTrades.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
