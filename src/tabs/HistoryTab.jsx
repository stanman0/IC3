import React, { useState, useEffect, useRef, useCallback } from 'react'
import Lightbox from '../components/Lightbox'
import ScoreDisplay from '../components/ScoreDisplay'
import CsvImportModal from '../components/CsvImportModal'
import TradingCalendar from '../components/TradingCalendar'
import MarkdownContent from '../components/MarkdownContent'
import { useToast } from '../components/Toast'
import SessionLog from '../components/SessionLog'
import SessionCompanion from '../components/SessionCompanion'
import JournalTab from './JournalTab'

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

const POINT_VALUES = { ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5 }

const MOODS = [
  { emoji: '😣', label: 'Distressed', value: 1 },
  { emoji: '😟', label: 'Anxious', value: 2 },
  { emoji: '😐', label: 'Neutral', value: 3 },
  { emoji: '😌', label: 'Focused', value: 4 },
  { emoji: '🔥', label: 'Locked in', value: 5 },
]

const CONFIDENCE = [
  { emoji: '🤷', label: 'No idea', value: 1 },
  { emoji: '🌀', label: 'Unclear', value: 2 },
  { emoji: '👀', label: 'Watching', value: 3 },
  { emoji: '💡', label: 'Clear', value: 4 },
  { emoji: '🎯', label: 'Conviction', value: 5 },
]

function calcPnl(instrument, direction, entry, exit, contracts) {
  const pv = POINT_VALUES[instrument]
  if (!pv || !entry || !exit || !contracts) return null
  const points = direction === 'Long' ? exit - entry : entry - exit
  return Math.round(points * Number(contracts) * pv * 100) / 100
}

function calcRisk(instrument, entry, stop, contracts) {
  const pv = POINT_VALUES[instrument]
  if (!pv || !entry || !stop || !contracts) return null
  return Math.round(Math.abs(entry - stop) * Number(contracts) * pv * 100) / 100
}

function autoRiskScore(riskDollars, maxRiskPerTrade) {
  if (!riskDollars || !maxRiskPerTrade) return 5
  const ratio = riskDollars / maxRiskPerTrade
  if (ratio <= 1.0) return 10
  if (ratio <= 1.1) return 8
  if (ratio <= 1.25) return 6
  if (ratio <= 1.5) return 4
  return 2
}

function PnlDisplay({ instrument, direction, entry, exit, contracts }) {
  const pnl = calcPnl(instrument, direction, parseFloat(entry), parseFloat(exit), contracts)
  return (
    <div className="detail-value" style={{ color: pnl == null ? 'var(--muted)' : pnl >= 0 ? 'var(--accent2)' : 'var(--danger)', fontWeight: 600 }}>
      {pnl == null ? '—' : (pnl >= 0 ? '+' : '') + '$' + pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </div>
  )
}

function RiskDisplay({ instrument, entry, stop, contracts, maxRiskPerTrade }) {
  const risk = calcRisk(instrument, parseFloat(entry), parseFloat(stop), contracts)
  const over = maxRiskPerTrade && risk > maxRiskPerTrade
  return (
    <div className="detail-value" style={{ color: risk == null ? 'var(--muted)' : over ? 'var(--danger)' : 'var(--text)', fontWeight: risk != null ? 600 : 400 }}>
      {risk == null ? '—' : '$' + risk.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      {over && <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--danger)' }}>▲ limit</span>}
    </div>
  )
}

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
    const key = t.date
    counters[key] = (counters[key] || 0) + 1
    labels[t.id] = `${t.instrument} Trade #${counters[key]}`
  }
  return labels
}

function TradeDetail({ trade, label, settings, onBack, onUpdate, onTradesChanged }) {
  const showToast = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ ...trade })
  const [lightbox, setLightbox] = useState({ open: false, index: 0 })
  const [statusMsg, setStatusMsg] = useState('')
  const [gradeOpen, setGradeOpen] = useState(false)
  const [criteriaChecked, setCriteriaChecked] = useState([])
  const [execScores, setExecScores] = useState({ entry: 5, mgmt: 5, patience: 5, rules: 5, risk: 5 })
  const [newScreenshots, setNewScreenshots] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)
  const [psychOpen, setPsychOpen] = useState(false)
  const [psychMood, setPsychMood] = useState(null)
  const [psychConfidence, setPsychConfidence] = useState(null)
  const [psychBehaviors, setPsychBehaviors] = useState([])
  const [psychMentalState, setPsychMentalState] = useState('')
  const [psychBelief, setPsychBelief] = useState('')
  const [psychCommitment, setPsychCommitment] = useState('')

  let ssPathsArr = []
  try { ssPathsArr = JSON.parse(trade.screenshot_paths || '[]') } catch {}
  let criteriaArr = []
  try { criteriaArr = JSON.parse(trade.criteria_checked || '[]') } catch {}

  const enterEditMode = () => {
    setEditForm({ ...trade })
    try { setCriteriaChecked(JSON.parse(trade.criteria_checked || '[]')) } catch { setCriteriaChecked([]) }
    setExecScores({
      entry: trade.exec_entry || 5,
      mgmt: trade.exec_mgmt || 5,
      patience: trade.exec_patience || 5,
      rules: trade.exec_rules || 5,
      risk: trade.exec_rules ? autoRiskScore(calcRisk(trade.instrument, trade.entry_price, trade.stop_price, trade.contracts), settings.maxRiskPerTrade) : 5,
    })
    setGradeOpen(!!trade.grade)
    setNewScreenshots([])
    setPsychMood(trade.pre_mood || null)
    setPsychConfidence(trade.pre_confidence || null)
    try { setPsychBehaviors(JSON.parse(trade.behaviors_noted || '[]')) } catch { setPsychBehaviors([]) }
    setPsychMentalState(trade.mental_state || '')
    setPsychBelief(trade.belief || '')
    setPsychCommitment(trade.psych_commitment || '')
    setPsychOpen(!!(trade.pre_mood || trade.mental_state || trade.belief))
    setIsEditing(true)
  }

  const computeEditGrade = () => {
    if (!gradeOpen || criteriaChecked.length === 0) return null
    const criteriaScore = (criteriaChecked.length / settings.criteria.length) * 100
    const execValues = [execScores.entry, execScores.mgmt, execScores.patience, execScores.rules, execScores.risk]
    const hasExec = execValues.some(v => v > 0)
    const execAvg = execValues.reduce((a, b) => a + b, 0) / 5
    const overall = hasExec
      ? Math.round(criteriaScore * 0.5 + (execAvg / 10 * 100) * 0.5)
      : Math.round(criteriaScore)
    let letter = 'F'
    if (overall >= 90) letter = 'A+'
    else if (overall >= 80) letter = 'A'
    else if (overall >= 70) letter = 'B'
    else if (overall >= 60) letter = 'C'
    else if (overall >= 50) letter = 'D'
    return { score: overall, grade: letter }
  }

  const handleSave = async () => {
    setStatusMsg('Saving...')
    try {
      const grade = computeEditGrade()
      const gradeData = grade ? {
        grade: grade.grade,
        grade_score: grade.score,
        criteria_checked: JSON.stringify(criteriaChecked),
        exec_entry: execScores.entry,
        exec_mgmt: execScores.mgmt,
        exec_patience: execScores.patience,
        exec_rules: execScores.rules,
      } : {}

      const psychData = {
        pre_mood: psychMood,
        pre_confidence: psychConfidence,
        behaviors_noted: JSON.stringify(psychBehaviors),
        mental_state: psychMentalState,
        belief: psychBelief,
        psych_commitment: psychCommitment,
      }

      const res = await fetch(`/api/trades/${trade.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, ...gradeData, ...psychData })
      })
      if (!res.ok) throw new Error('Update failed')

      if (newScreenshots.length > 0) {
        const formData = new FormData()
        formData.append('tradeId', trade.id)
        newScreenshots.forEach(ss => formData.append('screenshots', ss.file))
        const ssRes = await fetch('/api/screenshots/upload', { method: 'POST', body: formData })
        const ssData = await ssRes.json()
        const existing = JSON.parse(editForm.screenshot_paths || '[]')
        await fetch(`/api/trades/${trade.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screenshot_paths: JSON.stringify([...existing, ...ssData.paths]) })
        })
      }

      showToast('success', 'Trade saved')
      setStatusMsg('')
      setIsEditing(false)
      setNewScreenshots([])
      onUpdate()
      if (onTradesChanged) onTradesChanged()
    } catch (err) {
      showToast('error', 'Save failed: ' + err.message)
      setStatusMsg('')
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this trade?')) return
    try {
      const res = await fetch(`/api/trades/${trade.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      showToast('success', 'Trade deleted')
      onBack()
      onUpdate()
      if (onTradesChanged) onTradesChanged()
    } catch (err) {
      showToast('error', 'Delete failed: ' + err.message)
    }
  }

  const updateEditForm = (field, value) => {
    setEditForm(prev => {
      const next = { ...prev, [field]: value }
      const entry = parseFloat(field === 'entry_price' ? value : next.entry_price)
      const exit  = parseFloat(field === 'exit_price'  ? value : next.exit_price)
      const stop  = parseFloat(field === 'stop_price'  ? value : next.stop_price)
      const dir   = field === 'direction' ? value : next.direction

      if (['entry_price', 'exit_price', 'direction'].includes(field) && entry && exit) {
        const points = dir === 'Long' ? exit - entry : entry - exit
        next.outcome = points > 0 ? 'Win' : points < 0 ? 'Loss' : 'Breakeven'
      }
      if (['entry_price', 'exit_price', 'stop_price', 'direction'].includes(field)) {
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

  const handleNewFiles = useCallback((files) => {
    setNewScreenshots(prev => [
      ...prev,
      ...Array.from(files).map(f => ({ file: f, url: URL.createObjectURL(f) }))
    ])
  }, [])

  if (isEditing) {
    const editSsPaths = (() => { try { return JSON.parse(editForm.screenshot_paths || '[]') } catch { return [] } })()

    return (
      <div className="edit-mode">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="btn btn-ghost" onClick={() => { setIsEditing(false); setNewScreenshots([]) }}>← Cancel</button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {statusMsg && <span className="status-msg">{statusMsg}</span>}
            <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={handleDelete}>Delete</button>
            <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
          </div>
        </div>

        <div className="section-label">Trade Details</div>
        <div className="form-row cols-4">
          <div>
            <label>Date</label>
            <input type="date" value={editForm.date || ''} onChange={e => updateEditForm('date', e.target.value)} />
          </div>
          <div>
            <label>Instrument</label>
            <select value={editForm.instrument || ''} onChange={e => updateEditForm('instrument', e.target.value)}>
              {settings.instruments.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label>Direction</label>
            <select value={editForm.direction || ''} onChange={e => updateEditForm('direction', e.target.value)}>
              {settings.directions.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label>Session</label>
            <select value={editForm.session || ''} onChange={e => updateEditForm('session', e.target.value)}>
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

        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
          <div>
            <label>Outcome <span style={{ color: 'var(--muted)', fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>(auto)</span></label>
            <select value={editForm.outcome || 'Win'} onChange={e => updateEditForm('outcome', e.target.value)}>
              {['Win', 'Loss', 'Breakeven', 'Scratch'].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label>R:R <span style={{ color: 'var(--muted)', fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>(auto)</span></label>
            <input type="number" step="any" value={editForm.rr || ''} onChange={e => updateEditForm('rr', e.target.value)} />
          </div>
          <div>
            <label>P&amp;L $</label>
            <PnlDisplay instrument={editForm.instrument} direction={editForm.direction} entry={editForm.entry_price} exit={editForm.exit_price} contracts={editForm.contracts} />
          </div>
          <div>
            <label>Risk $</label>
            <RiskDisplay instrument={editForm.instrument} entry={editForm.entry_price} stop={editForm.stop_price} contracts={editForm.contracts} maxRiskPerTrade={settings.maxRiskPerTrade} />
          </div>
          <div>
            <label>HTF Bias</label>
            <select value={editForm.htf_bias || ''} onChange={e => updateEditForm('htf_bias', e.target.value)}>
              {['Bullish', 'Bearish', 'Neutral', 'Uncertain'].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="section-label">ICT Setup</div>
        <div className="form-row cols-2">
          <div>
            <label>Primary Setup</label>
            <div className="pill-select-wrap">
              {settings.setups.map(s => (
                <span
                  key={s}
                  className={`setup-pill ${editForm.setup === s ? 'selected' : ''}`}
                  onClick={() => updateEditForm('setup', editForm.setup === s ? '' : s)}
                >{s}</span>
              ))}
            </div>
          </div>
          <div>
            <label>Timeframe</label>
            <select value={editForm.timeframe || '5m'} onChange={e => updateEditForm('timeframe', e.target.value)}>
              {['15m', '5m', '3m', '1m', '4H', '1H', 'Daily'].map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="section-label">Trade Narrative</div>
        <textarea rows={4} placeholder="What did you see?" value={editForm.narrative || ''} onChange={e => updateEditForm('narrative', e.target.value)} />

        <div className="form-row cols-2" style={{ marginTop: 16 }}>
          <div>
            <label>Execution Notes</label>
            <textarea rows={3} value={editForm.execution_notes || ''} onChange={e => updateEditForm('execution_notes', e.target.value)} />
          </div>
          <div>
            <label>Hindsight</label>
            <textarea rows={3} value={editForm.hindsight || ''} onChange={e => updateEditForm('hindsight', e.target.value)} />
          </div>
        </div>

        <div className="section-label">Screenshots</div>
        {editSsPaths.length > 0 && (
          <div className="screenshot-grid" style={{ marginBottom: 10 }}>
            {editSsPaths.map((p, i) => (
              <div key={i} className="screenshot-thumb">
                <span className="screenshot-index-badge">{i + 1}</span>
                <img src={p} alt={`Screenshot ${i + 1}`} onClick={() => setLightbox({ open: true, index: i })} />
              </div>
            ))}
          </div>
        )}
        {newScreenshots.length > 0 && (
          <div className="screenshot-grid" style={{ marginBottom: 10 }}>
            {newScreenshots.map((ss, i) => (
              <div key={i} className="screenshot-thumb">
                <img src={ss.url} alt={`New ${i + 1}`} />
                <div className="screenshot-thumb-overlay">
                  <button onClick={() => { URL.revokeObjectURL(ss.url); setNewScreenshots(prev => prev.filter((_, j) => j !== i)) }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div
          className={`screenshot-dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleNewFiles(e.dataTransfer.files) }}
          onClick={() => fileInputRef.current?.click()}
        >
          Drop new screenshots here or click to add
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleNewFiles(e.target.files)} />
        </div>

        <div className={`grade-accordion ${gradeOpen ? 'open' : ''}`} style={{ marginTop: 16 }}>
          <button className="grade-toggle" onClick={() => setGradeOpen(o => !o)}>
            <span className="grade-chevron">▶</span>
            <span className="grade-toggle-label">Grade this trade</span>
            <span className="grade-toggle-hint">Optional — adds A–F score</span>
          </button>
          <div className="grade-body">
            <div className="section-label" style={{ marginTop: 0 }}>ICT Criteria</div>
            <div className="criteria-grid">
              {settings.criteria.map(c => (
                <div
                  key={c}
                  className={`criteria-item ${criteriaChecked.includes(c) ? 'checked' : ''}`}
                  onClick={() => setCriteriaChecked(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                >
                  <div className="check">{criteriaChecked.includes(c) ? '✓' : ''}</div>
                  {c}
                </div>
              ))}
            </div>
            <div className="section-label">Execution Scores</div>
            {[['entry', 'Entry Quality'], ['mgmt', 'Trade Management'], ['patience', 'Patience'], ['rules', 'Rule Adherence'], ['risk', 'Risk Management']].map(([key, lbl]) => (
              <div key={key} className="slider-row">
                <span className="slider-label">{lbl}</span>
                <input type="range" min={1} max={10} value={execScores[key]} onChange={e => setExecScores(prev => ({ ...prev, [key]: +e.target.value }))} />
                <span className="slider-val">{execScores[key]}</span>
              </div>
            ))}
            {(() => {
              const g = computeEditGrade()
              return g ? (
                <div style={{ marginTop: 12, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' }}>
                  Grade: <strong>{g.grade}</strong> — {g.score}/100
                </div>
              ) : null
            })()}
          </div>
        </div>

        <div className={`grade-accordion ${psychOpen ? 'open' : ''}`} style={{ marginTop: 8 }}>
          <button className="grade-toggle" onClick={() => setPsychOpen(o => !o)}>
            <span className="grade-chevron">▶</span>
            <span className="grade-toggle-label">Psychology</span>
            <span className="grade-toggle-hint">Optional — mood, mindset, behaviors</span>
          </button>
          <div className="grade-body">
            <div className="form-row cols-2" style={{ marginTop: 0 }}>
              <div>
                <label>Pre-Trade Mood</label>
                <div className="mood-grid">
                  {MOODS.map(m => (
                    <button
                      key={m.value}
                      className={`mood-btn ${psychMood === m.value ? 'selected' : ''}`}
                      onClick={() => setPsychMood(m.value)}
                    >
                      {m.emoji}
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label>Confidence</label>
                <div className="mood-grid">
                  {CONFIDENCE.map(c => (
                    <button
                      key={c.value}
                      className={`mood-btn ${psychConfidence === c.value ? 'selected' : ''}`}
                      onClick={() => setPsychConfidence(c.value)}
                    >
                      {c.emoji}
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {settings.behaviors.length > 0 && (
              <>
                <div className="section-label" style={{ marginTop: 12 }}>Behaviors Present</div>
                <div className="criteria-grid">
                  {settings.behaviors.map(b => (
                    <div
                      key={b}
                      className={`criteria-item ${psychBehaviors.includes(b) ? 'checked' : ''}`}
                      onClick={() => setPsychBehaviors(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
                    >
                      <div className="check">{psychBehaviors.includes(b) ? '✓' : ''}</div>
                      {b}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <label>Mental state during trade</label>
              <textarea rows={2} value={psychMentalState} onChange={e => setPsychMentalState(e.target.value)} />
            </div>
            <div className="form-row cols-2" style={{ marginTop: 8 }}>
              <div>
                <label>Underlying belief / fear</label>
                <textarea rows={2} value={psychBelief} onChange={e => setPsychBelief(e.target.value)} />
              </div>
              <div>
                <label>Commitment for next session</label>
                <textarea rows={2} value={psychCommitment} onChange={e => setPsychCommitment(e.target.value)} />
              </div>
            </div>
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
          <button className="btn btn-ghost" onClick={enterEditMode}>Edit Trade</button>
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

      <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        <div>
          <label>Outcome</label>
          <div className="detail-value">{trade.outcome || '—'}</div>
        </div>
        <div>
          <label>R:R</label>
          <div className="detail-value">{trade.rr != null ? trade.rr + 'R' : '—'}</div>
        </div>
        <div>
          <label>P&amp;L $</label>
          <PnlDisplay instrument={trade.instrument} direction={trade.direction} entry={trade.entry_price} exit={trade.exit_price} contracts={trade.contracts} />
        </div>
        <div>
          <label>Risk $</label>
          <RiskDisplay instrument={trade.instrument} entry={trade.entry_price} stop={trade.stop_price} contracts={trade.contracts} maxRiskPerTrade={settings.maxRiskPerTrade} />
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

      {/* Psychology */}
      {(trade.pre_mood || trade.pre_confidence || trade.mental_state || trade.belief || trade.psych_commitment) && (() => {
        const moodItem = MOODS.find(m => m.value === trade.pre_mood)
        const confItem = CONFIDENCE.find(c => c.value === trade.pre_confidence)
        let behaviorsArr = []
        try { behaviorsArr = JSON.parse(trade.behaviors_noted || '[]') } catch {}
        return (
          <>
            <div className="section-label">Psychology</div>
            <div className="output-container">
              <div style={{ padding: '12px 16px' }}>
                {(moodItem || confItem) && (
                  <div style={{ display: 'flex', gap: 24, marginBottom: behaviorsArr.length > 0 || trade.mental_state ? 10 : 0 }}>
                    {moodItem && (
                      <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                        Mood: <span style={{ color: 'var(--text)' }}>{moodItem.emoji} {moodItem.label}</span>
                      </div>
                    )}
                    {confItem && (
                      <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                        Confidence: <span style={{ color: 'var(--text)' }}>{confItem.emoji} {confItem.label}</span>
                      </div>
                    )}
                  </div>
                )}
                {behaviorsArr.length > 0 && (
                  <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--muted)', marginBottom: 8 }}>
                    Behaviors: <span style={{ color: 'var(--accent)' }}>{behaviorsArr.join(', ')}</span>
                  </div>
                )}
                {trade.mental_state && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginBottom: 2 }}>MENTAL STATE</div>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{trade.mental_state}</div>
                  </div>
                )}
                {(trade.belief || trade.psych_commitment) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 4 }}>
                    {trade.belief && (
                      <div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginBottom: 2 }}>BELIEF / FEAR</div>
                        <div style={{ fontSize: 12, color: 'var(--text)' }}>{trade.belief}</div>
                      </div>
                    )}
                    {trade.psych_commitment && (
                      <div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', marginBottom: 2 }}>COMMITMENT</div>
                        <div style={{ fontSize: 12, color: 'var(--text)' }}>{trade.psych_commitment}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )
      })()}

      {/* AI Analysis */}
      {trade.ai_analysis && (
        <>
          <div className="section-label">IC3 Analysis</div>
          <div className="output-container">
            <div className="output-body"><MarkdownContent>{trade.ai_analysis}</MarkdownContent></div>
          </div>
        </>
      )}

      {/* Session Notes */}
      <SessionLog date={trade.date} readOnly={true} label="Session Notes" />

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

export default function HistoryTab({ settings, onTradesChanged }) {
  const showToast = useToast()
  const [trades, setTrades] = useState([])
  const [selectedTrade, setSelectedTrade] = useState(null)
  const [lightbox, setLightbox] = useState({ open: false, images: [], index: 0 })
  const [showImport, setShowImport] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [showNewTrade, setShowNewTrade] = useState(false)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('ic3_view_mode') || 'card')

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
      if (onTradesChanged) onTradesChanged()
    } catch (err) {
      console.error('Failed to load trades:', err)
    }
  }

  const toggleViewMode = () => {
    setViewMode(prev => {
      const next = prev === 'card' ? 'table' : 'card'
      localStorage.setItem('ic3_view_mode', next)
      return next
    })
  }

  const openLightbox = (paths, index) => {
    const images = paths.map(p => ({ url: p, caption: '' }))
    setLightbox({ open: true, images, index })
  }

  if (trades.length === 0 && !selectedTrade) {
    return (
      <>
        <div className="empty-state">
          <p>No trades recorded yet.</p>
          <p>Use the Journal tab to log your first trade, or import from Tradovate.</p>
          <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowImport(true)}>
            Import Tradovate CSV
          </button>
        </div>
        {showImport && (
          <CsvImportModal
            onClose={() => setShowImport(false)}
            onImported={(count) => { setShowImport(false); fetchTrades() }}
          />
        )}
      </>
    )
  }

  const labels = buildTradeLabels(trades)

  // New trade view
  if (showNewTrade) {
    return (
      <JournalTab
        settings={settings}
        onBack={() => setShowNewTrade(false)}
        onSaved={() => { setShowNewTrade(false); fetchTrades() }}
      />
    )
  }

  // Detail view
  if (selectedTrade) {
    return (
      <TradeDetail
        trade={selectedTrade}
        label={labels[selectedTrade.id] || `${selectedTrade.instrument} #?`}
        settings={settings}
        onBack={() => setSelectedTrade(null)}
        onUpdate={fetchTrades}
        onTradesChanged={onTradesChanged}
      />
    )
  }

  // Streak dots — last 10 trades
  const streakData = (() => {
    const sorted = [...trades].sort((a, b) => {
      if (a.date < b.date) return 1
      if (a.date > b.date) return -1
      return b.id - a.id
    })
    const dots = sorted.slice(0, 10).reverse().map(t => {
      const o = (t.outcome || '').toLowerCase()
      if (o === 'win') return 'win'
      if (o === 'loss') return 'loss'
      return 'be'
    })
    // Current streak
    let streak = 0, streakType = null
    for (const t of sorted) {
      const o = (t.outcome || '').toLowerCase()
      if (o !== 'win' && o !== 'loss') continue
      if (!streakType) streakType = o
      if (o === streakType) streak++
      else break
    }
    return { dots, streak, streakType }
  })()

  // List view
  const visibleTrades = selectedDate ? trades.filter(t => t.date === selectedDate) : trades

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="section-label" style={{ margin: 0, flex: 1 }}>Daily Trades</div>
        <div className="view-toggle" style={{ marginLeft: 12 }}>
          <button className={viewMode === 'card' ? 'active' : ''} onClick={() => toggleViewMode()} title="Card view">&#9638;</button>
          <button className={viewMode === 'table' ? 'active' : ''} onClick={() => toggleViewMode()} title="Table view">&#9776;</button>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px', marginLeft: 12 }} onClick={() => setShowNewTrade(true)}>
          + Add Trade
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px', marginLeft: 8 }} onClick={() => setShowImport(true)}>
          Import CSV
        </button>
      </div>

      {showImport && (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onImported={(count) => { setShowImport(false); fetchTrades(); showToast('success', `${count} trade${count !== 1 ? 's' : ''} imported`) }}
        />
      )}

      <TradingCalendar
        trades={trades}
        selectedDate={selectedDate}
        onDaySelect={setSelectedDate}
      />

      {/* Streak dots */}
      {trades.length > 0 && (
        <div className="streak-row">
          {streakData.streakType && (
            <span className="streak-label" style={{ color: streakData.streakType === 'win' ? 'var(--accent2)' : 'var(--danger)' }}>
              {streakData.streakType === 'win' ? 'W' : 'L'}{streakData.streak}
            </span>
          )}
          <div className="streak-dots">
            {streakData.dots.map((d, i) => <span key={i} className={`streak-dot ${d}`} />)}
          </div>
          <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Last {streakData.dots.length}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="section-label" style={{ margin: 0, flex: 1 }}>
              {selectedDate ? `Trades \u2014 ${selectedDate}` : 'All Trades'}
            </div>
            {selectedDate && (
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', marginLeft: 12 }} onClick={() => setSelectedDate(null)}>
                Clear filter
              </button>
            )}
          </div>
          {visibleTrades.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--mono)', padding: '16px 0' }}>
          No trades on this day.
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && visibleTrades.length > 0 && (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginTop: 8 }}>
          <table className="trade-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Instrument</th>
                <th>Side</th>
                <th>Outcome</th>
                <th style={{ textAlign: 'right' }}>R:R</th>
                <th style={{ textAlign: 'right' }}>P&L</th>
                <th>Setup</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {visibleTrades.map(trade => {
                const pnl = calcPnl(trade.instrument, trade.direction, trade.entry_price, trade.exit_price, trade.contracts)
                return (
                  <tr key={trade.id} onClick={() => setSelectedTrade(trade)}>
                    <td>{trade.date}</td>
                    <td>{trade.instrument}</td>
                    <td style={{ color: trade.direction === 'Long' ? 'var(--accent2)' : 'var(--danger)' }}>{trade.direction}</td>
                    <td><span className={`tag ${outcomeTagClass(trade.outcome)}`}>{trade.outcome}</span></td>
                    <td className="col-rr">{trade.rr != null ? trade.rr + 'R' : '\u2014'}</td>
                    <td className="col-pnl" style={{ color: pnl == null ? 'var(--muted)' : pnl >= 0 ? 'var(--accent2)' : 'var(--danger)' }}>
                      {pnl == null ? '\u2014' : (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(0)}
                    </td>
                    <td style={{ color: 'var(--purple)' }}>{trade.setup || '\u2014'}</td>
                    <td>{trade.grade || '\u2014'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CARD VIEW */}
      {viewMode === 'card' && visibleTrades.map(trade => {
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
                {labels[trade.id]} \u2014 {trade.date}
              </span>
              <div className="trade-card-tags">
                <span className={`tag ${outcomeTagClass(trade.outcome)}`}>{trade.outcome}</span>
                {trade.rr != null && <span className="tag tag-blue">{trade.rr}R</span>}
                {(() => {
                  const pnl = calcPnl(trade.instrument, trade.direction, trade.entry_price, trade.exit_price, trade.contracts)
                  if (pnl == null) return null
                  return (
                    <span className={`tag ${pnl >= 0 ? 'tag-green' : 'tag-red'}`}>
                      {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  )
                })()}
                {(() => {
                  const risk = calcRisk(trade.instrument, trade.entry_price, trade.stop_price, trade.contracts)
                  if (risk == null) return null
                  return <span className="tag tag-amber">R ${risk.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                })()}
                {trade.setup && <span className="tag tag-purple">{trade.setup}</span>}
                {ssPathsArr.length > 0 && <span className="tag tag-amber">\ud83d\udcf8 {ssPathsArr.length}</span>}
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
      <SessionCompanion date={selectedDate || todayDate()} />
    </div>
  )
}

