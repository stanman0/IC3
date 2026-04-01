import React, { useState, useEffect, useRef, useCallback } from 'react'
import Lightbox from '../components/Lightbox'
import MarkdownContent from '../components/MarkdownContent'
import { useToast } from '../components/Toast'

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

const PREMARKET_SYSTEM = `You are IC3 — a direct, no-nonsense ICT trading coach. Analyze this pre-market plan and give specific, actionable feedback on bias quality, setup clarity, risk awareness, and psychological readiness. Use ## for section headers.`

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function PreMarketTab({ settings }) {
  const showToast = useToast()
  const [date, setDate] = useState(today())
  const [recordId, setRecordId] = useState(null)
  const [session, setSession] = useState('')
  const [htfBias, setHtfBias] = useState('')
  const [mood, setMood] = useState(null)
  const [confidence, setConfidence] = useState(null)
  const [keyLevels, setKeyLevels] = useState('')
  const [narrative, setNarrative] = useState('')
  const [setupsWatching, setSetupsWatching] = useState([])
  const [gamePlan, setGamePlan] = useState('')
  const [newsEvents, setNewsEvents] = useState('')
  const [existingScreenshots, setExistingScreenshots] = useState([])
  const [newScreenshots, setNewScreenshots] = useState([])
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [loadingNews, setLoadingNews] = useState(false)
  const [biasVerdict, setBiasVerdict] = useState(null)
  const [biasVerdictNotes, setBiasVerdictNotes] = useState("")
  const [lightbox, setLightbox] = useState({ open: false, index: 0 })
  const fileInputRef = useRef(null)

  useEffect(() => {
    loadEntry(date)
  }, [date])

  const loadEntry = async (d) => {
    try {
      const res = await fetch(`/api/premarket?date=${d}`)
      const data = await res.json()
      if (data) {
        setRecordId(data.id)
        setSession(data.session || '')
        setHtfBias(data.htf_bias || '')
        setMood(data.mood || null)
        setConfidence(data.confidence || null)
        setKeyLevels(data.key_levels || '')
        setNarrative(data.narrative || '')
        setSetupsWatching(JSON.parse(data.setups_watching || '[]'))
        setGamePlan(data.game_plan || '')
        setNewsEvents(data.news_events || '')
        setExistingScreenshots(JSON.parse(data.screenshot_paths || '[]'))
        setAiAnalysis(data.ai_analysis || '')
      } else {
        setRecordId(null)
        setSession('')
        setHtfBias('')
        setMood(null)
        setConfidence(null)
        setKeyLevels('')
        setNarrative('')
        setSetupsWatching([])
        setGamePlan('')
        setNewsEvents('')
        setExistingScreenshots([])
        setAiAnalysis('')
      }
      setNewScreenshots([])
      setStatusMsg('')
    } catch (err) {
      console.error('Failed to load pre-market entry:', err)
    }
  }

  const toggleSetup = (s) => {
    setSetupsWatching(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const handleNewFiles = useCallback((files) => {
    setNewScreenshots(prev => [
      ...prev,
      ...Array.from(files).map(f => ({ file: f, url: URL.createObjectURL(f) }))
    ])
  }, [])

  const loadNews = async () => {
    setLoadingNews(true)
    try {
      const res = await fetch(`/api/news?date=${date}`)
      const events = await res.json()
      if (!Array.isArray(events) || events.length === 0) {
        setNewsEvents(prev => prev ? prev : 'No USD red/orange events found for this date.')
        return
      }
      const lines = events.map(e => {
        const time = new Date(e.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })
        const impact = e.impact === 'High' ? '🔴' : '🟠'
        const details = [e.forecast && `Fcst: ${e.forecast}`, e.previous && `Prev: ${e.previous}`].filter(Boolean).join(', ')
        return `${impact} ${time} ET — ${e.title}${details ? ` (${details})` : ''}`
      })
      setNewsEvents(lines.join('\n'))
    } catch (err) {
      setNewsEvents('Error loading news: ' + err.message)
    } finally {
      setLoadingNews(false)
    }
  }

  const handleSave = async () => {
    setStatusMsg('Saving...')
    try {
      const body = {
        date,
        session,
        htf_bias: htfBias,
        mood,
        confidence,
        key_levels: keyLevels,
        narrative,
        setups_watching: JSON.stringify(setupsWatching),
        game_plan: gamePlan,
        news_events: newsEvents,
        screenshot_paths: JSON.stringify(existingScreenshots),
        ai_analysis: aiAnalysis,
      }

      let savedRecord
      if (recordId) {
        const res = await fetch(`/api/premarket/${recordId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        savedRecord = await res.json()
      } else {
        const res = await fetch('/api/premarket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        savedRecord = await res.json()
        setRecordId(savedRecord.id)
      }

      if (newScreenshots.length > 0) {
        const formData = new FormData()
        formData.append('tradeId', `pm_${date}`)
        newScreenshots.forEach(ss => formData.append('screenshots', ss.file))
        const ssRes = await fetch('/api/screenshots/upload', { method: 'POST', body: formData })
        const ssData = await ssRes.json()
        const allPaths = [...existingScreenshots, ...ssData.paths]
        setExistingScreenshots(allPaths)
        setNewScreenshots([])
        await fetch(`/api/premarket/${savedRecord.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screenshot_paths: JSON.stringify(allPaths) })
        })
      }

      showToast('success', 'Plan saved')
      setStatusMsg('')
    } catch (err) {
      showToast('error', 'Save failed: ' + err.message)
      setStatusMsg('')
    }
  }

  const analyzePlan = async () => {
    const moodItem = MOODS.find(m => m.value === mood)
    const confItem = CONFIDENCE.find(c => c.value === confidence)
    setAiAnalysis('')
    setStreaming(true)

    const userPrompt = `Analyze this pre-market trading plan:
Date: ${date}
Session: ${session || 'Not specified'}
HTF Bias: ${htfBias || 'Not specified'}
Mood: ${moodItem?.label || 'Not set'} (${mood || 0}/5)
Confidence: ${confItem?.label || 'Not set'} (${confidence || 0}/5)
Key Levels: ${keyLevels || 'None noted'}
Market Narrative: ${narrative || 'N/A'}
Setups Watching: ${setupsWatching.length > 0 ? setupsWatching.join(', ') : 'None'}
Economic Events: ${newsEvents || 'None'}
Game Plan: ${gamePlan || 'N/A'}

## Bias Quality
## Setup Readiness
## Risk Awareness
## Psychological Readiness
## One Thing to Watch

Under 350 words. Direct and specific.`

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: PREMARKET_SYSTEM,
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
                setAiAnalysis(fullText)
              }
            } catch {}
          }
        }
      }
      setStreaming(false)

      // Auto-save AI analysis
      const id = recordId
      if (id) {
        await fetch(`/api/premarket/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ai_analysis: fullText })
        })
      }
    } catch (err) {
      setAiAnalysis('Error: ' + err.message)
      setStreaming(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="section-label" style={{ margin: 0 }}>Pre-Market Plan</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {statusMsg && <span className="status-msg">{statusMsg}</span>}
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ fontSize: 12, fontFamily: 'var(--mono)', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px' }}
          />
          <button className="btn btn-primary" onClick={handleSave}>Save Plan</button>
        </div>
      </div>

      <div className="form-row cols-2">
        <div>
          <label>Session</label>
          <select value={session} onChange={e => setSession(e.target.value)}>
            <option value="">—</option>
            {['London', 'NY AM', 'NY PM', 'Asia', 'Overnight'].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label>HTF Bias</label>
          <select value={htfBias} onChange={e => setHtfBias(e.target.value)}>
            <option value="">—</option>
            {['Bullish', 'Bearish', 'Neutral', 'Uncertain'].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="section-label">Pre-Session State</div>
      <div className="form-row cols-2">
        <div>
          <label>Mood</label>
          <div className="mood-grid">
            {MOODS.map(m => (
              <button
                key={m.value}
                className={`mood-btn ${mood === m.value ? 'selected' : ''}`}
                onClick={() => setMood(m.value)}
              >
                {m.emoji}
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>Confidence in Bias</label>
          <div className="mood-grid">
            {CONFIDENCE.map(c => (
              <button
                key={c.value}
                className={`mood-btn ${confidence === c.value ? 'selected' : ''}`}
                onClick={() => setConfidence(c.value)}
              >
                {c.emoji}
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section-label">Market Context</div>
      <div className="form-row cols-2">
        <div>
          <label>Key Levels</label>
          <textarea rows={3} placeholder="Support/resistance, PDH/PDL, weekly levels..." value={keyLevels} onChange={e => setKeyLevels(e.target.value)} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ margin: 0 }}>News / Economic Events</label>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 10, padding: '2px 8px' }}
              onClick={loadNews}
              disabled={loadingNews}
            >
              {loadingNews ? 'Loading...' : '⬇ Load USD News'}
            </button>
          </div>
          <textarea rows={3} placeholder="CPI, FOMC, NFP, earnings..." value={newsEvents} onChange={e => setNewsEvents(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>Market Narrative</label>
        <textarea rows={4} placeholder="What story is the market telling? What is price doing relative to higher timeframe structure?" value={narrative} onChange={e => setNarrative(e.target.value)} />
      </div>

      <div className="section-label">Setups Watching</div>
      <div className="pill-select-wrap" style={{ marginBottom: 16 }}>
        {settings.setups.map(s => (
          <span
            key={s}
            className={`setup-pill ${setupsWatching.includes(s) ? 'selected' : ''}`}
            onClick={() => toggleSetup(s)}
          >{s}</span>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>Game Plan</label>
        <textarea rows={5} placeholder="What are you looking for specifically? Entry conditions, invalidation levels, targets..." value={gamePlan} onChange={e => setGamePlan(e.target.value)} />
      </div>

      <div className="section-label">Screenshots</div>
      {existingScreenshots.length > 0 && (
        <div className="screenshot-grid" style={{ marginBottom: 10 }}>
          {existingScreenshots.map((p, i) => (
            <div key={i} className="screenshot-thumb" onClick={() => setLightbox({ open: true, index: i })}>
              <span className="screenshot-index-badge">{i + 1}</span>
              <img src={p} alt={`Screenshot ${i + 1}`} />
              <div className="screenshot-thumb-overlay">
                <button title="View">⤢</button>
              </div>
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
                <button onClick={(e) => { e.stopPropagation(); URL.revokeObjectURL(ss.url); setNewScreenshots(prev => prev.filter((_, j) => j !== i)) }}>✕</button>
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
        Drop charts here or click to add
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => handleNewFiles(e.target.files)} />
      </div>

      <div className="action-row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={analyzePlan} disabled={streaming}>
          {streaming ? 'Analyzing...' : 'Analyze Plan'}
        </button>
      </div>

      {(aiAnalysis || streaming) && (
        <div className="output-container" style={{ marginTop: 12 }}>
          <div className="output-header">
            <span className="output-title">Pre-Market Analysis</span>
            {streaming && <div className="spinner" />}
          </div>
          <div className="output-body">
            {streaming ? <>{aiAnalysis}<span className="cursor" /></> : <MarkdownContent>{aiAnalysis}</MarkdownContent>}
          </div>
        </div>
      )}

      {/* Post-Session — filled after market close */}
      <div className="post-session-block">
        <div className="section-label" style={{ marginTop: 0 }}>Post-Session</div>
        <div>
          <label>Was your HTF bias confirmed by price action?</label>
          <div className="verdict-btns">
            {[
              { key: 'confirmed',   label: '✓ Confirmed',   cls: 'confirmed' },
              { key: 'mixed',       label: '~ Mixed',        cls: 'mixed' },
              { key: 'invalidated', label: '✗ Invalidated',  cls: 'invalidated' },
            ].map(v => (
              <button
                key={v.key}
                className={`verdict-btn ${v.cls} ${biasVerdict === v.key ? "active" : ""}`}
                onClick={() => setBiasVerdict(prev => prev === v.key ? null : v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
          {biasVerdict && (
            <textarea
              rows={2}
              placeholder="Brief notes — what confirmed or invalidated your thesis?"
              value={biasVerdictNotes}
              onChange={e => setBiasVerdictNotes(e.target.value)}
              style={{ marginTop: 10 }}
            />
          )}
        </div>
      </div>

      {lightbox.open && existingScreenshots.length > 0 && (
        <Lightbox
          images={existingScreenshots.map(p => ({ url: p, caption: '' }))}
          currentIndex={lightbox.index}
          onClose={() => setLightbox({ open: false, index: 0 })}
          onNavigate={(i) => setLightbox({ open: true, index: i })}
        />
      )}
    </div>
  )
}
