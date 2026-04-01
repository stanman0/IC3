import React, { useState, useEffect, useRef } from 'react'
import './SessionCompanion.css'

const THEMES = [
  { key: 'narrative',   label: 'Narrative',   color: '#3182ce' },
  { key: 'observation', label: 'Observation', color: 'var(--muted)' },
  { key: 'setup',       label: 'Setup',       color: 'var(--accent)' },
  { key: 'emotion',     label: 'Emotion',     color: 'var(--danger)' },
  { key: 'process',     label: 'Process',     color: '#f59e0b' },
]

const DIRECTION_COLORS = {
  BULL: '#48bb78',
  BEAR: 'var(--danger)',
  NEUTRAL: 'var(--muted)',
  FLIP: '#f59e0b',
}

const STATE_TAGS = ['FOMO', 'Hesitation', 'Revenge', 'Overconfident', 'Fear']

function fmtTime(t) {
  if (!t) return '\u2014'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function nowET() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  return `${String(et.getHours()).padStart(2, '0')}:${String(et.getMinutes()).padStart(2, '0')}`
}

function dominantTheme(notes) {
  if (!notes.length) return null
  const counts = {}
  notes.forEach(n => { if (n.theme) counts[n.theme] = (counts[n.theme] || 0) + 1 })
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return top ? top[0] : null
}

function NoteMeta({ n }) {
  const parts = []

  if (n.theme === 'narrative') {
    if (n.direction) parts.push(
      <span key="dir" className="sc-meta-badge" style={{ color: DIRECTION_COLORS[n.direction] }}>{n.direction}</span>
    )
    if (n.conviction) parts.push(
      <span key="conv" className="sc-meta-badge">{'■'.repeat(n.conviction)}{'□'.repeat(5 - n.conviction)}</span>
    )
  }

  if (n.theme === 'observation' && n.price_level != null) {
    parts.push(<span key="lvl" className="sc-meta-badge">@ {n.price_level}</span>)
  }

  if (n.theme === 'setup') {
    if (n.setup_type) parts.push(<span key="stype" className="sc-meta-badge">{n.setup_type}</span>)
    if (n.price_level != null) parts.push(<span key="slvl" className="sc-meta-badge">@ {n.price_level}</span>)
    if (n.setup_validated) {
      const cls = n.setup_validated === 'TRIGGERED' ? 'triggered' : n.setup_validated === 'INVALIDATED' ? 'invalidated' : ''
      parts.push(<span key="val" className={`sc-meta-badge ${cls}`}>{n.setup_validated}</span>)
    }
  }

  if (n.theme === 'emotion') {
    if (n.intensity) parts.push(
      <span key="int" className="sc-meta-badge">{'■'.repeat(n.intensity)}{'□'.repeat(5 - n.intensity)}</span>
    )
    if (n.state_tags) {
      let tags = []
      try { tags = JSON.parse(n.state_tags) } catch {}
      tags.forEach(t => parts.push(<span key={t} className="sc-meta-badge">{t}</span>))
    }
  }

  if (n.theme === 'process' && n.premarket_candidate) {
    parts.push(<span key="pm" className="sc-meta-badge premarket">{'\u2191'} pre-market</span>)
  }

  if (parts.length === 0) return null
  return <div className="sc-note-meta">{parts}</div>
}

export default function SessionCompanion({ date }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('sc_open') !== 'false' } catch { return true }
  })
  const [notes, setNotes] = useState([])
  const [input, setInput] = useState('')
  const [activeTheme, setActiveTheme] = useState(null)
  const [arrivingId, setArrivingId] = useState(null)

  // Narrative
  const [direction, setDirection] = useState(null)
  const [conviction, setConviction] = useState(null)
  // Observation
  const [priceLevel, setPriceLevel] = useState('')
  // Setup
  const [setupType, setSetupType] = useState('')
  const [setupPriceLevel, setSetupPriceLevel] = useState('')
  const [reactionExpected, setReactionExpected] = useState('')
  const [invalidationCondition, setInvalidationCondition] = useState('')
  // Emotion
  const [intensity, setIntensity] = useState(3)
  const [stateTags, setStateTags] = useState([])
  // Process
  const [premarketCandidate, setPremarketCandidate] = useState(false)

  const inputRef = useRef(null)
  const feedRef = useRef(null)

  const resetThemeFields = () => {
    setDirection(null)
    setConviction(null)
    setPriceLevel('')
    setSetupType('')
    setSetupPriceLevel('')
    setReactionExpected('')
    setInvalidationCondition('')
    setIntensity(3)
    setStateTags([])
    setPremarketCandidate(false)
  }

  useEffect(() => {
    if (date) load(date)
  }, [date])

  useEffect(() => {
    try { localStorage.setItem('sc_open', String(open)) } catch {}
  }, [open])

  // Auto-scroll to bottom when notes change
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [notes])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 60)
        return
      }
      if (e.altKey && !e.ctrlKey && !e.shiftKey && open) {
        const idx = parseInt(e.key) - 1
        if (idx >= 0 && idx < THEMES.length) {
          e.preventDefault()
          const key = THEMES[idx].key
          setActiveTheme(prev => { if (prev === key) { resetThemeFields(); return null } resetThemeFields(); return key })
          setTimeout(() => inputRef.current?.focus(), 20)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const load = async (d) => {
    try {
      const res = await fetch(`/api/session-notes?date=${d}`)
      const data = await res.json()
      setNotes(Array.isArray(data) ? data : [])
    } catch {}
  }

  const handleThemeToggle = (key) => {
    setActiveTheme(prev => {
      if (prev === key) { resetThemeFields(); return null }
      resetThemeFields()
      return key
    })
  }

  const buildPayload = (text, snapTheme, snapDirection, snapConviction, snapPriceLevel, snapSetupType, snapSetupPriceLevel, snapReactionExpected, snapInvalidationCondition, snapIntensity, snapStateTags, snapPremarketCandidate) => {
    const base = { date, time: nowET(), note: text, theme: snapTheme }
    if (snapTheme === 'narrative') return { ...base, direction: snapDirection, conviction: snapConviction }
    if (snapTheme === 'observation') return { ...base, price_level: snapPriceLevel ? parseFloat(snapPriceLevel) : null }
    if (snapTheme === 'setup') return {
      ...base,
      setup_type: snapSetupType || null,
      price_level: snapSetupPriceLevel ? parseFloat(snapSetupPriceLevel) : null,
      reaction_expected: snapReactionExpected || null,
      invalidation_condition: snapInvalidationCondition || null,
      setup_validated: 'PENDING',
    }
    if (snapTheme === 'emotion') return { ...base, intensity: snapIntensity, state_tags: snapStateTags }
    if (snapTheme === 'process') return { ...base, premarket_candidate: snapPremarketCandidate }
    return base
  }

  const submit = async (e) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return

    // Snapshot current field values before resetting
    const snap = {
      theme: activeTheme,
      direction, conviction, priceLevel,
      setupType, setupPriceLevel, reactionExpected, invalidationCondition,
      intensity, stateTags, premarketCandidate,
    }

    // Optimistic note
    const optId = `opt_${Date.now()}`
    const optimistic = {
      id: optId, date, time: nowET(), note: text,
      theme: snap.theme, direction: snap.direction, conviction: snap.conviction,
      price_level: snap.theme === 'observation' ? (snap.priceLevel ? parseFloat(snap.priceLevel) : null)
                 : snap.theme === 'setup' ? (snap.setupPriceLevel ? parseFloat(snap.setupPriceLevel) : null) : null,
      setup_type: snap.setupType || null,
      reaction_expected: snap.reactionExpected || null,
      invalidation_condition: snap.invalidationCondition || null,
      setup_validated: snap.theme === 'setup' ? 'PENDING' : null,
      intensity: snap.intensity,
      state_tags: snap.stateTags.length ? JSON.stringify(snap.stateTags) : null,
      premarket_candidate: snap.premarketCandidate ? 1 : 0,
    }

    setNotes(prev => [...prev, optimistic])
    setArrivingId(optId)
    setInput('')
    setActiveTheme(null)
    resetThemeFields()
    inputRef.current?.focus()
    setTimeout(() => setArrivingId(null), 400)

    try {
      const payload = buildPayload(text, snap.theme, snap.direction, snap.conviction, snap.priceLevel, snap.setupType, snap.setupPriceLevel, snap.reactionExpected, snap.invalidationCondition, snap.intensity, snap.stateTags, snap.premarketCandidate)
      const res = await fetch('/api/session-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const note = await res.json()
      setNotes(prev => prev.map(n => n.id === optId ? note : n))
      setArrivingId(note.id)
      setTimeout(() => setArrivingId(null), 400)
    } catch {}
  }

  const remove = async (id) => {
    await fetch(`/api/session-notes/${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  const handleInputKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); submit() }
  }

  const handleOpen = () => {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 60)
  }

  const dom = dominantTheme(notes)
  const domTheme = dom ? THEMES.find(t => t.key === dom) : null
  const lastNote = notes[notes.length - 1]

  return (
    <div className={`sc-panel ${open ? 'sc-open' : 'sc-closed'}`}>
      {!open && (
        <div className="sc-collapsed-bar" onClick={handleOpen} title="Open Session Companion (Ctrl+Shift+L)">
          <span className="sc-collapsed-label">Session</span>
          {notes.length > 0 && <span className="sc-collapsed-count">{notes.length}</span>}
          <span className="sc-collapsed-chevron">{'\u203a'}</span>
        </div>
      )}

      {open && (
        <div className="sc-inner">
          <div className="sc-header">
            <div className="sc-header-left">
              <span className="sc-title">Session</span>
              {notes.length > 0 && <span className="sc-count">{notes.length}</span>}
              {domTheme && (
                <span className="sc-dominant-theme" style={{ color: domTheme.color }}>
                  {domTheme.label}
                </span>
              )}
            </div>
            <div className="sc-header-right">
              {lastNote && <span className="sc-last-time">{fmtTime(lastNote.time)}</span>}
              <button className="sc-collapse-btn" onClick={() => setOpen(false)} title="Collapse">{'\u2039'}</button>
            </div>
          </div>

          <form className="sc-input-area" onSubmit={submit}>
            <div className="sc-themes">
              {THEMES.map((t, i) => (
                <button
                  key={t.key}
                  type="button"
                  className={`sc-theme-btn${activeTheme === t.key ? ' active' : ''}`}
                  style={activeTheme === t.key ? { borderColor: t.color, color: t.color } : {}}
                  onClick={() => handleThemeToggle(t.key)}
                  title={`${t.label} (Alt+${i + 1})`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTheme === 'narrative' && (
              <div className="sc-theme-fields">
                <div className="sc-field-row">
                  {['BULL', 'BEAR', 'NEUTRAL', 'FLIP'].map(d => (
                    <button key={d} type="button"
                      className={`sc-dir-btn${direction === d ? ' active' : ''}`}
                      style={direction === d ? { borderColor: DIRECTION_COLORS[d], color: DIRECTION_COLORS[d] } : {}}
                      onClick={() => setDirection(prev => prev === d ? null : d)}
                    >{d}</button>
                  ))}
                </div>
                <div className="sc-field-row">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button"
                      className={`sc-conv-btn${conviction === n ? ' active' : ''}`}
                      onClick={() => setConviction(prev => prev === n ? null : n)}
                    >{n}</button>
                  ))}
                  <span className="sc-field-label">conviction</span>
                </div>
              </div>
            )}

            {activeTheme === 'observation' && (
              <div className="sc-theme-fields">
                <input type="number" step="0.25" placeholder="price level (optional)"
                  className="sc-field-input" value={priceLevel}
                  onChange={e => setPriceLevel(e.target.value)} />
              </div>
            )}

            {activeTheme === 'setup' && (
              <div className="sc-theme-fields">
                <input type="text" placeholder="setup type (CISD, FVG, OB, Breaker…)"
                  className="sc-field-input" value={setupType}
                  onChange={e => setSetupType(e.target.value)} />
                <div className="sc-field-row-2">
                  <input type="number" step="0.25" placeholder="price level"
                    className="sc-field-input" value={setupPriceLevel}
                    onChange={e => setSetupPriceLevel(e.target.value)} />
                  <input type="text" placeholder="invalidation"
                    className="sc-field-input" value={invalidationCondition}
                    onChange={e => setInvalidationCondition(e.target.value)} />
                </div>
                <input type="text" placeholder="expected reaction"
                  className="sc-field-input" value={reactionExpected}
                  onChange={e => setReactionExpected(e.target.value)} />
              </div>
            )}

            {activeTheme === 'emotion' && (
              <div className="sc-theme-fields">
                <div className="sc-field-row">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button"
                      className={`sc-int-btn${intensity === n ? ' active' : ''}`}
                      onClick={() => setIntensity(n)}
                    >{'■'.repeat(n)}{'□'.repeat(5-n)}</button>
                  ))}
                  <span className="sc-field-label">intensity</span>
                </div>
                <div className="sc-field-row">
                  {STATE_TAGS.map(tag => (
                    <button key={tag} type="button"
                      className={`sc-state-btn${stateTags.includes(tag) ? ' active' : ''}`}
                      onClick={() => setStateTags(prev =>
                        prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                      )}
                    >{tag}</button>
                  ))}
                </div>
              </div>
            )}

            {activeTheme === 'process' && (
              <div className="sc-theme-fields">
                <label className="sc-pm-label">
                  <input type="checkbox" checked={premarketCandidate}
                    onChange={e => setPremarketCandidate(e.target.checked)} />
                  flag for pre-market checklist
                </label>
              </div>
            )}

            <div className="sc-input-row">
              <textarea
                ref={inputRef}
                rows={3}
                className="sc-input"
                placeholder={activeTheme
                  ? `${THEMES.find(t => t.key === activeTheme)?.label} — note`
                  : 'What are you seeing\u2026'}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                autoComplete="off"
              />
              <button type="submit" className="sc-submit" disabled={!input.trim()}>{'\u21b5'}</button>
            </div>
            <div className="sc-shortcuts-hint">Ctrl+Shift+L{'\u00b7'}Alt+1-5{'\u00b7'}Ctrl+Enter</div>
          </form>

          <div className="sc-feed" ref={feedRef}>
            {notes.length === 0 && (
              <div className="sc-empty">What are you seeing{'\n'}right now…</div>
            )}
            {notes.map(n => {
              const theme = THEMES.find(t => t.key === n.theme)
              return (
                <div key={n.id} className={`sc-note${n.id === arrivingId ? ' sc-note-arrive' : ''}`}>
                  <div className="sc-note-header">
                    <span className="sc-note-time">{fmtTime(n.time)}</span>
                    {theme && <span className="sc-note-theme" style={{ color: theme.color }}>{theme.label}</span>}
                    <button className="sc-note-delete" onClick={() => remove(n.id)}>{'\u00d7'}</button>
                  </div>
                  <div className="sc-note-text">{n.note}</div>
                  <NoteMeta n={n} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
