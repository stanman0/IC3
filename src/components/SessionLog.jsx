import React, { useState, useEffect, useRef } from 'react'

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
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function nowET() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  return `${String(et.getHours()).padStart(2, '0')}:${String(et.getMinutes()).padStart(2, '0')}`
}

function NoteMeta({ n }) {
  const parts = []

  if (n.theme === 'narrative') {
    if (n.direction) parts.push(
      <span key="dir" className="meta-badge" style={{ color: DIRECTION_COLORS[n.direction] }}>{n.direction}</span>
    )
    if (n.conviction) parts.push(
      <span key="conv" className="meta-badge">{'■'.repeat(n.conviction)}{'□'.repeat(5 - n.conviction)} conviction</span>
    )
  }

  if (n.theme === 'observation' && n.price_level != null) {
    parts.push(<span key="lvl" className="meta-badge">@ {n.price_level}</span>)
  }

  if (n.theme === 'setup') {
    if (n.setup_type) parts.push(<span key="stype" className="meta-badge">{n.setup_type}</span>)
    if (n.price_level != null) parts.push(<span key="slvl" className="meta-badge">@ {n.price_level}</span>)
    if (n.setup_validated) {
      const cls = n.setup_validated === 'TRIGGERED' ? 'triggered' : n.setup_validated === 'INVALIDATED' ? 'invalidated' : 'pending'
      parts.push(<span key="val" className={`meta-badge ${cls}`}>{n.setup_validated}</span>)
    }
  }

  if (n.theme === 'emotion') {
    if (n.intensity) parts.push(
      <span key="int" className="meta-badge">{'■'.repeat(n.intensity)}{'□'.repeat(5 - n.intensity)}</span>
    )
    if (n.state_tags) {
      let tags = []
      try { tags = JSON.parse(n.state_tags) } catch {}
      tags.forEach(t => parts.push(<span key={t} className="meta-badge">{t}</span>))
    }
  }

  if (n.theme === 'process' && n.premarket_candidate) {
    parts.push(<span key="pm" className="meta-badge premarket">↑ pre-market</span>)
  }

  if (parts.length === 0) return null
  return <div className="session-note-meta">{parts}</div>
}

function resetThemeFields(setters) {
  setters.setDirection(null)
  setters.setConviction(null)
  setters.setPriceLevel('')
  setters.setSetupType('')
  setters.setSetupPriceLevel('')
  setters.setReactionExpected('')
  setters.setInvalidationCondition('')
  setters.setIntensity(3)
  setters.setStateTags([])
  setters.setPremarketCandidate(false)
}

// readOnly: show notes without input (used in trade detail)
// label: header text override
export default function SessionLog({ date, readOnly = false, label = 'Session Log' }) {
  const [notes, setNotes] = useState([])
  const [input, setInput] = useState('')
  const [activeTheme, setActiveTheme] = useState(null)

  // Narrative fields
  const [direction, setDirection] = useState(null)
  const [conviction, setConviction] = useState(null)

  // Observation fields
  const [priceLevel, setPriceLevel] = useState('')

  // Setup fields
  const [setupType, setSetupType] = useState('')
  const [setupPriceLevel, setSetupPriceLevel] = useState('')
  const [reactionExpected, setReactionExpected] = useState('')
  const [invalidationCondition, setInvalidationCondition] = useState('')

  // Emotion fields
  const [intensity, setIntensity] = useState(3)
  const [stateTags, setStateTags] = useState([])

  // Process fields
  const [premarketCandidate, setPremarketCandidate] = useState(false)

  const inputRef = useRef(null)
  const setters = { setDirection, setConviction, setPriceLevel, setSetupType, setSetupPriceLevel, setReactionExpected, setInvalidationCondition, setIntensity, setStateTags, setPremarketCandidate }

  useEffect(() => {
    if (date) load(date)
  }, [date])

  const load = async (d) => {
    try {
      const res = await fetch(`/api/session-notes?date=${d}`)
      setNotes(await res.json())
    } catch {}
  }

  const handleThemeToggle = (key) => {
    setActiveTheme(prev => {
      if (prev === key) { resetThemeFields(setters); return null }
      resetThemeFields(setters)
      return key
    })
  }

  const buildPayload = (text) => {
    const base = { date, time: nowET(), note: text, theme: activeTheme }
    if (activeTheme === 'narrative') {
      return { ...base, direction, conviction }
    }
    if (activeTheme === 'observation') {
      return { ...base, price_level: priceLevel ? parseFloat(priceLevel) : null }
    }
    if (activeTheme === 'setup') {
      return {
        ...base,
        setup_type: setupType || null,
        price_level: setupPriceLevel ? parseFloat(setupPriceLevel) : null,
        reaction_expected: reactionExpected || null,
        invalidation_condition: invalidationCondition || null,
        setup_validated: 'PENDING',
      }
    }
    if (activeTheme === 'emotion') {
      return { ...base, intensity, state_tags: stateTags }
    }
    if (activeTheme === 'process') {
      return { ...base, premarket_candidate: premarketCandidate }
    }
    return base
  }

  const submit = async (e) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return
    try {
      const res = await fetch('/api/session-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(text))
      })
      const note = await res.json()
      setNotes(prev => [...prev, note])
      setInput('')
      setActiveTheme(null)
      resetThemeFields(setters)
      inputRef.current?.focus()
    } catch {}
  }

  const remove = async (id) => {
    await fetch(`/api/session-notes/${id}`, { method: 'DELETE' })
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  if (readOnly && notes.length === 0) return null

  return (
    <div className="session-log">
      <div className="session-log-header">
        <span className="session-log-label">{label}</span>
        {notes.length > 0 && (
          <span className="session-log-count">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {notes.length > 0 && (
        <div className="session-log-feed">
          {notes.map(n => {
            const theme = THEMES.find(t => t.key === n.theme)
            return (
              <div key={n.id} className="session-note">
                <span className="session-note-time">{fmtTime(n.time)}</span>
                <span className="session-note-tag" style={{ color: theme?.color || 'transparent' }}>
                  {theme?.label || ''}
                </span>
                <div className="session-note-body">
                  <span className="session-note-text">{n.note}</span>
                  <NoteMeta n={n} />
                </div>
                {!readOnly && (
                  <button className="session-note-delete" onClick={() => remove(n.id)}>✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!readOnly && (
        <form className="session-log-input-area" onSubmit={submit}>
          {/* Theme selector */}
          <div className="session-log-tags">
            {THEMES.map(t => (
              <button
                key={t.key}
                type="button"
                className={`session-tag-btn ${activeTheme === t.key ? 'active' : ''}`}
                style={activeTheme === t.key ? { borderColor: t.color, color: t.color } : {}}
                onClick={() => handleThemeToggle(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Theme-specific fields */}
          {activeTheme === 'narrative' && (
            <div className="session-theme-fields">
              <div className="theme-field-row">
                {['BULL', 'BEAR', 'NEUTRAL', 'FLIP'].map(d => (
                  <button key={d} type="button"
                    className={`direction-btn ${direction === d ? 'active' : ''}`}
                    style={direction === d ? { borderColor: DIRECTION_COLORS[d], color: DIRECTION_COLORS[d] } : {}}
                    onClick={() => setDirection(prev => prev === d ? null : d)}
                  >{d}</button>
                ))}
              </div>
              <div className="theme-field-row">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button"
                    className={`conviction-btn ${conviction === n ? 'active' : ''}`}
                    onClick={() => setConviction(prev => prev === n ? null : n)}
                  >{n}</button>
                ))}
                <span className="field-label">conviction</span>
              </div>
            </div>
          )}

          {activeTheme === 'observation' && (
            <div className="session-theme-fields">
              <input type="number" step="0.25" placeholder="price level (optional)"
                className="theme-field-input" value={priceLevel}
                onChange={e => setPriceLevel(e.target.value)} />
            </div>
          )}

          {activeTheme === 'setup' && (
            <div className="session-theme-fields">
              <input type="text" placeholder="setup type  (e.g. CISD, FVG, OB, Breaker)"
                className="theme-field-input" value={setupType}
                onChange={e => setSetupType(e.target.value)} />
              <input type="number" step="0.25" placeholder="price level"
                className="theme-field-input" value={setupPriceLevel}
                onChange={e => setSetupPriceLevel(e.target.value)} />
              <input type="text" placeholder="expected reaction"
                className="theme-field-input" value={reactionExpected}
                onChange={e => setReactionExpected(e.target.value)} />
              <input type="text" placeholder="invalidation condition"
                className="theme-field-input" value={invalidationCondition}
                onChange={e => setInvalidationCondition(e.target.value)} />
            </div>
          )}

          {activeTheme === 'emotion' && (
            <div className="session-theme-fields">
              <div className="theme-field-row">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button"
                    className={`intensity-btn ${intensity === n ? 'active' : ''}`}
                    onClick={() => setIntensity(n)}
                  >{'■'.repeat(n)}{'□'.repeat(5-n)}</button>
                ))}
                <span className="field-label">intensity</span>
              </div>
              <div className="theme-field-row">
                {STATE_TAGS.map(tag => (
                  <button key={tag} type="button"
                    className={`state-tag-btn ${stateTags.includes(tag) ? 'active' : ''}`}
                    onClick={() => setStateTags(prev =>
                      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                    )}
                  >{tag}</button>
                ))}
              </div>
            </div>
          )}

          {activeTheme === 'process' && (
            <div className="session-theme-fields">
              <label className="premarket-flag-label">
                <input type="checkbox" checked={premarketCandidate}
                  onChange={e => setPremarketCandidate(e.target.checked)} />
                flag for pre-market checklist
              </label>
            </div>
          )}

          {/* Text input row */}
          <div className="session-log-input-row">
            <input
              ref={inputRef}
              type="text"
              className="session-log-input"
              placeholder={activeTheme ? `${THEMES.find(t=>t.key===activeTheme)?.label} — what are you thinking…` : 'What are you seeing right now…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className="session-log-submit" disabled={!input.trim()}>↵</button>
          </div>
        </form>
      )}
    </div>
  )
}
