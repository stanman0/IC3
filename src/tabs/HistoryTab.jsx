import React, { useState, useEffect } from 'react'
import Lightbox from '../components/Lightbox'
import ScoreDisplay from '../components/ScoreDisplay'

const outcomeTagClass = (outcome) => {
  if (!outcome) return 'tag-amber'
  const o = outcome.toLowerCase()
  if (o === 'win') return 'tag-green'
  if (o === 'loss') return 'tag-red'
  return 'tag-amber'
}

function buildTradeLabels(trades) {
  const counters = {}
  // trades come sorted DESC — process in chronological order for numbering
  const sorted = [...trades].sort((a, b) => {
    const da = a.date || a.created_at
    const db = b.date || b.created_at
    if (da < db) return -1
    if (da > db) return 1
    return a.id - b.id
  })
  const labels = {}
  for (const t of sorted) {
    const key = `${t.date}|${t.instrument}`
    counters[key] = (counters[key] || 0) + 1
    labels[t.id] = `${t.instrument} #${counters[key]}`
  }
  return labels
}

function TradeDetail({ trade, label, settings, onBack, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ ...trade })
  const [lightbox, setLightbox] = useState({ open: false, index: 0 })
  const [statusMsg, setStatusMsg] = useState('')

  let ssPathsArr = []
  try { ssPathsArr = JSON.parse(trade.screenshot_paths || '[]') } catch {}
  let criteriaArr = []
  try { criteriaArr = JSON.parse(trade.criteria_checked || '[]') } catch {}

  const handleSave = async () => {
    setStatusMsg('Saving...')
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      })
      if (!res.ok) throw new Error('Update failed')
      setStatusMsg('✓ Saved')
      setIsEditing(false)
      onUpdate()
    } catch (err) {
      setStatusMsg('Error: ' + err.message)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this trade?')) return
    try {
      const res = await fetch(`/api/trades/${trade.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onBack()
      onUpdate()
    } catch (err) {
      alert('Error deleting trade: ' + err.message)
    }
  }

  const updateEditForm = (field, value) => {
    setEditForm(prev => {
      const next = { ...prev, [field]: value }
      if (['entry_price', 'exit_price', 'stop_price', 'direction'].includes(field)) {
        const entry = parseFloat(field === 'entry_price' ? value : next.entry_price)
        const exit = parseFloat(field === 'exit_price' ? value : next.exit_price)
        const stop = parseFloat(field === 'stop_price' ? value : next.stop_price)
        const dir = field === 'direction' ? value : next.direction
        if (entry && stop && entry !== stop) {
          const risk = Math.abs(entry - stop)
          if (exit) {
            const reward = dir === 'Short' ? entry - exit : exit - entry
            next.rr = Math.round((reward / risk) * 100) / 100
          }
        }
      }
      return next
    })
  }

  if (isEditing) {
    return (
      <div className="edit-mode">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="btn btn-ghost" onClick={() => setIsEditing(false)}>← Cancel</button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {statusMsg && <span className="status-msg">{statusMsg}</span>}
            <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
          </div>
        </div>

        <div className="section-label">Edit Trade Details</div>
        <div className="form-row cols-4">
          <div>
            <label>Date</label>
            <input type="date" value={editForm.date || ''} onChange={e => updateEditForm('date', e.target.value)} />
          </div>
          <div>
            <label>Instrument</label>
            <select value={editForm.instrument} onChange={e => updateEditForm('instrument', e.target.value)}>
              {settings.instruments.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label>Direction</label>
            <select value={editForm.direction} onChange={e => updateEditForm('direction', e.target.value)}>
              {settings.directions.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label>Session</label>
            <select value={editForm.session} onChange={e => updateEditForm('session', e.target.value)}>
              {['London', 'NY AM', 'NY PM', 'Asia', 'Overnight'].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row cols-4">
          <div>
            <label>Entry Price</label>
            <input type="number" step="any" value={editForm.entry_price || ''} onChange={e => updateEditForm('entry_price', e.target.value)} />
          </div>
          <div>
            <label>Exit Price</label>
            <input type="number" step="any" value={editForm.exit_price || ''} onChange={e => updateEditForm('exit_price', e.target.value)} />
          </div>
          <div>
            <label>Stop Loss</label>
            <input type="number" step="any" value={editForm.stop_price || ''} onChange={e => updateEditForm('stop_price', e.target.value)} />
          </div>
          <div>
            <label>Contracts</label>
            <input type="number" value={editForm.contracts || ''} onChange={e => updateEditForm('contracts', e.target.value)} />
          </div>
        </div>

        <div className="form-row cols-3">
          <div>
            <label>Outcome</label>
            <select value={editForm.outcome} onChange={e => updateEditForm('outcome', e.target.value)}>
              {['Win', 'Loss', 'Breakeven', 'Scratch'].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label>R:R</label>
            <input type="number" step="any" value={editForm.rr || ''} onChange={e => updateEditForm('rr', e.target.value)} />
          </div>
          <div>
            <label>HTF Bias</label>
            <select value={editForm.htf_bias} onChange={e => updateEditForm('htf_bias', e.target.value)}>
              {['Bullish', 'Bearish', 'Neutral', 'Uncertain'].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="section-label">Narrative & Notes</div>
        <textarea
          rows={5}
          value={editForm.narrative || ''}
          onChange={e => updateEditForm('narrative', e.target.value)}
        />
        
        <div className="form-row cols-2" style={{ marginTop: 16 }}>
          <div>
            <label>Execution Notes</label>
            <textarea
              rows={3}
              value={editForm.execution_notes || ''}
              onChange={e => updateEditForm('execution_notes', e.target.value)}
            />
          </div>
          <div>
            <label>Hindsight</label>
            <textarea
              rows={3}
              value={editForm.hindsight || ''}
              onChange={e => updateEditForm('hindsight', e.target.value)}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn btn-ghost" onClick={onBack}>
          ← Back to History
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={handleDelete}>Delete</button>
          <button className="btn btn-ghost" onClick={() => setIsEditing(true)}>Edit Trade</button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontFamily: 'var(--sans)', fontWeight: 800, fontSize: 22, color: 'var(--text)' }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{trade.date}</span>
        <div className="trade-card-tags">
          <span className={`tag ${outcomeTagClass(trade.outcome)}`}>{trade.outcome}</span>
          {trade.rr != null && <span className="tag tag-blue">{trade.rr}R</span>}
          {trade.grade && <span className="tag tag-amber">{trade.grade}</span>}
        </div>
      </div>

      {/* Trade Details Grid */}
      <div className="section-label">Trade Details</div>
      <div className="form-row cols-4">
        <div>
          <label>Instrument</label>
          <div className="detail-value">{trade.instrument || '—'}</div>
        </div>
        <div>
          <label>Direction</label>
          <div className="detail-value">{trade.direction || '—'}</div>
        </div>
        <div>
          <label>Session</label>
          <div className="detail-value">{trade.session || '—'}</div>
        </div>
        <div>
          <label>HTF Bias</label>
          <div className="detail-value">{trade.htf_bias || '—'}</div>
        </div>
      </div>

      <div className="form-row cols-4">
        <div>
          <label>Entry Price</label>
          <div className="detail-value">{trade.entry_price || '—'}</div>
        </div>
        <div>
          <label>Exit Price</label>
          <div className="detail-value">{trade.exit_price || '—'}</div>
        </div>
        <div>
          <label>Stop Loss</label>
          <div className="detail-value">{trade.stop_price || '—'}</div>
        </div>
        <div>
          <label>Contracts</label>
          <div className="detail-value">{trade.contracts || '—'}</div>
        </div>
      </div>

      <div className="form-row cols-3">
        <div>
          <label>Outcome</label>
          <div className="detail-value">{trade.outcome || '—'}</div>
        </div>
        <div>
          <label>R:R</label>
          <div className="detail-value">{trade.rr != null ? trade.rr + 'R' : '—'}</div>
        </div>
        <div>
          <label>Setup</label>
          <div className="detail-value">{trade.setup || '—'}</div>
        </div>
      </div>

      {/* Narrative */}
      {trade.narrative && (
        <>
          <div className="section-label">Trade Narrative</div>
          <div className="detail-text">{trade.narrative}</div>
        </>
      )}

      {/* Execution + Hindsight */}
      {(trade.execution_notes || trade.hindsight) && (
        <div className="form-row cols-2" style={{ marginTop: 12 }}>
          {trade.execution_notes && (
            <div>
              <label>Execution Notes</label>
              <div className="detail-text">{trade.execution_notes}</div>
            </div>
          )}
          {trade.hindsight && (
            <div>
              <label>Hindsight</label>
              <div className="detail-text">{trade.hindsight}</div>
            </div>
          )}
        </div>
      )}

      {/* Screenshots */}
      {ssPathsArr.length > 0 && (
        <>
          <div className="section-label">Screenshots</div>
          <div className="screenshot-grid">
            {ssPathsArr.map((path, i) => (
              <div key={i} className="screenshot-thumb" onClick={() => setLightbox({ open: true, index: i })}>
                <span className="screenshot-index-badge">{i + 1}</span>
                <img src={path} alt={`Screenshot ${i + 1}`} />
                <div className="screenshot-thumb-overlay">
                  <button title="View">⤢</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Grade */}
      {trade.grade && (
        <>
          <div className="section-label">Grade</div>
          <div className="output-container">
            <ScoreDisplay
              grade={trade.grade}
              score={trade.grade_score || 0}
              criteriaChecked={criteriaArr}
            />
            {(trade.exec_entry || trade.exec_mgmt || trade.exec_patience || trade.exec_rules) && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                  <span>Entry: <span style={{ color: 'var(--accent)' }}>{trade.exec_entry}/10</span></span>
                  <span>Mgmt: <span style={{ color: 'var(--accent)' }}>{trade.exec_mgmt}/10</span></span>
                  <span>Patience: <span style={{ color: 'var(--accent)' }}>{trade.exec_patience}/10</span></span>
                  <span>Rules: <span style={{ color: 'var(--accent)' }}>{trade.exec_rules}/10</span></span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* AI Analysis */}
      {trade.ai_analysis && (
        <>
          <div className="section-label">IC3 Analysis</div>
          <div className="output-container">
            <div className="output-body">{trade.ai_analysis}</div>
          </div>
        </>
      )}

      {/* Lightbox */}
      {lightbox.open && ssPathsArr.length > 0 && (
        <Lightbox
          images={ssPathsArr.map(p => ({ url: p, caption: '' }))}
          currentIndex={lightbox.index}
          onClose={() => setLightbox({ open: false, index: 0 })}
          onNavigate={(i) => setLightbox({ open: true, index: i })}
        />
      )}
    </div>
  )
}

export default function HistoryTab({ settings }) {
  const [trades, setTrades] = useState([])
  const [selectedTrade, setSelectedTrade] = useState(null)
  const [lightbox, setLightbox] = useState({ open: false, images: [], index: 0 })

  useEffect(() => {
    fetchTrades()
  }, [])

  const fetchTrades = async () => {
    try {
      const res = await fetch('/api/trades')
      const data = await res.json()
      setTrades(data)
      if (selectedTrade) {
        const updated = data.find(t => t.id === selectedTrade.id)
        if (updated) setSelectedTrade(updated)
      }
    } catch (err) {
      console.error('Failed to load trades:', err)
    }
  }

  const openLightbox = (paths, index) => {
    const images = paths.map(p => ({ url: p, caption: '' }))
    setLightbox({ open: true, images, index })
  }

  if (trades.length === 0 && !selectedTrade) {
    return (
      <div className="empty-state">
        <p>No trades recorded yet.</p>
        <p>Use the Journal tab to log your first trade.</p>
      </div>
    )
  }

  const labels = buildTradeLabels(trades)

  // Detail view
  if (selectedTrade) {
    return (
      <TradeDetail
        trade={selectedTrade}
        label={labels[selectedTrade.id] || `${selectedTrade.instrument} #?`}
        settings={settings}
        onBack={() => setSelectedTrade(null)}
        onUpdate={fetchTrades}
      />
    )
  }

  // List view
  return (
    <div>
      <div className="section-label">Trade History</div>
      {trades.map(trade => {
        let ssPathsArr = []
        try { ssPathsArr = JSON.parse(trade.screenshot_paths || '[]') } catch {}

        return (
          <div
            key={trade.id}
            className="trade-card trade-card-clickable"
            onClick={() => setSelectedTrade(trade)}
          >
            <div className="trade-card-header">
              <span className="trade-card-title">
                {labels[trade.id]} — {trade.date}
              </span>
              <div className="trade-card-tags">
                <span className={`tag ${outcomeTagClass(trade.outcome)}`}>{trade.outcome}</span>
                {trade.rr != null && <span className="tag tag-blue">{trade.rr}R</span>}
                {trade.setup && <span className="tag tag-purple">{trade.setup}</span>}
                {ssPathsArr.length > 0 && <span className="tag tag-amber">📸 {ssPathsArr.length}</span>}
                {trade.grade && <span className="tag tag-amber">{trade.grade}</span>}
              </div>
            </div>
            {trade.narrative && (
              <div className="trade-card-narrative">
                {trade.narrative.length > 100 ? trade.narrative.slice(0, 100) + '...' : trade.narrative}
              </div>
            )}
            {ssPathsArr.length > 0 && (
              <div className="trade-card-screenshots">
                {ssPathsArr.slice(0, 5).map((path, i) => (
                  <img
                    key={i}
                    src={path}
                    alt={`Trade screenshot ${i + 1}`}
                    onClick={(e) => { e.stopPropagation(); openLightbox(ssPathsArr, i) }}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {lightbox.open && (
        <Lightbox
          images={lightbox.images}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(prev => ({ ...prev, open: false }))}
          onNavigate={(i) => setLightbox(prev => ({ ...prev, index: i }))}
        />
      )}
    </div>
  )
}

