import React, { useState, useRef, useCallback } from 'react'
import ScoreDisplay from '../components/ScoreDisplay'
import Lightbox from '../components/Lightbox'

const today = () => new Date().toISOString().split('T')[0]

const SYSTEM_PROMPT = `You are IC3 — a brutally honest, deeply knowledgeable ICT trading coach. You know every concept in the ICT methodology: Smart Money Concepts, Order Blocks, Breaker Blocks, Fair Value Gaps, Liquidity sweeps, Market Structure Shifts, Kill Zones, Power of 3, OTE entries, NWOG/NDOG, Silver Bullet, PD arrays. When chart screenshots are provided, read them directly — call out what you see: visible OBs, FVGs, sweep wicks, displacement candles, structure. Your words carry weight because they are earned. You do not pad, you do not hedge, you do not repeat yourself. Use ## for section headers. Use **bold** only for ICT concept names.`

export default function JournalTab({ settings }) {
  const [form, setForm] = useState({
    date: today(),
    instrument: 'ES',
    direction: 'Long',
    session: 'NY AM',
    entry_price: '',
    exit_price: '',
    stop_price: '',
    contracts: '',
    outcome: 'Win',
    rr: '',
    htf_bias: 'Bullish',
    setup: '',
    timeframe: '5m',
    narrative: '',
    execution_notes: '',
    hindsight: '',
  })

  const [screenshots, setScreenshots] = useState([])
  const [captions, setCaptions] = useState([])
  const [gradeOpen, setGradeOpen] = useState(false)
  const [criteriaChecked, setCriteriaChecked] = useState([])
  const [execScores, setExecScores] = useState({ entry: 5, mgmt: 5, patience: 5, rules: 5 })
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [gradeResult, setGradeResult] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [lightbox, setLightbox] = useState({ open: false, index: 0 })
  const fileInputRef = useRef(null)
  const outputRef = useRef(null)

  const updateForm = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // Auto-calc R:R when prices change
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

  const toggleCriteria = (item) => {
    setCriteriaChecked(prev =>
      prev.includes(item) ? prev.filter(c => c !== item) : [...prev, item]
    )
  }

  const handleFiles = (files) => {
    const remaining = 10 - screenshots.length
    const newFiles = Array.from(files).slice(0, remaining)
    if (newFiles.length === 0) return
    const newScreenshots = newFiles.map(f => ({ file: f, url: URL.createObjectURL(f) }))
    setScreenshots(prev => [...prev, ...newScreenshots])
    setCaptions(prev => [...prev, ...newFiles.map(() => '')])
  }

  const removeScreenshot = (index) => {
    URL.revokeObjectURL(screenshots[index].url)
    setScreenshots(prev => prev.filter((_, i) => i !== index))
    setCaptions(prev => prev.filter((_, i) => i !== index))
  }

  const updateCaption = (index, value) => {
    setCaptions(prev => { const n = [...prev]; n[index] = value; return n })
  }

  const computeGrade = () => {
    if (!gradeOpen || criteriaChecked.length === 0) return null
    const criteriaScore = (criteriaChecked.length / settings.criteria.length) * 100
    const execAvg = (execScores.entry + execScores.mgmt + execScores.patience + execScores.rules) / 4
    const overall = Math.round(criteriaScore * 0.5 + (execAvg / 10 * 100) * 0.5)
    let letter = 'F'
    if (overall >= 90) letter = 'A+'
    else if (overall >= 80) letter = 'A'
    else if (overall >= 70) letter = 'B'
    else if (overall >= 60) letter = 'C'
    else if (overall >= 50) letter = 'D'
    return { score: overall, grade: letter }
  }

  const buildUserPrompt = (grade) => {
    let prompt = `You are IC3 — an elite ICT trading coach. Analyze this futures trade with full context and deliver a single unified review. Be direct, precise, and unsparing. No filler.

═══ TRADE RECORD ═══
Instrument: ${form.instrument} | Date: ${form.date} | Session: ${form.session}
Direction: ${form.direction} | HTF Bias: ${form.htf_bias} | Outcome: ${form.outcome}
Entry: ${form.entry_price || 'N/A'} | Exit: ${form.exit_price || 'N/A'} | Stop: ${form.stop_price || 'N/A'} | Contracts: ${form.contracts || 'N/A'}
R:R Achieved: ${form.rr || 'N/A'} | Setup type: ${form.setup || 'N/A'} | Entry TF: ${form.timeframe}

TRADE NARRATIVE:
${form.narrative || 'N/A'}

EXECUTION NOTES:
${form.execution_notes || 'N/A'}

HINDSIGHT:
${form.hindsight || 'N/A'}`

    if (screenshots.length > 0) {
      const captionList = captions.filter(c => c).join(', ') || 'none'
      prompt += `\nSCREENSHOTS: ${screenshots.length} chart image(s) attached. Captions: ${captionList}`
    }

    if (grade) {
      const missed = settings.criteria.filter(c => !criteriaChecked.includes(c))
      prompt += `\nICT CRITERIA MET (${criteriaChecked.length}/${settings.criteria.length}): ${criteriaChecked.join(', ')}
ICT CRITERIA MISSED: ${missed.join(', ')}
Execution scores: Entry ${execScores.entry}/10 · Management ${execScores.mgmt}/10 · Patience ${execScores.patience}/10 · Rules ${execScores.rules}/10
Computed process score: ${grade.score}/100 → Grade: ${grade.grade}`
    }

    const wordLimit = grade ? 380 : 300
    prompt += `

═══ REQUIRED OUTPUT FORMAT ═══`

    if (grade) {
      prompt += `\n## Grade: ${grade.grade}
One sentence justifying the letter grade.
`
    }

    prompt += `
## Setup Validity
## Execution
## What You Got Right
## What to Fix
## Edge Pattern
[One sentence naming the repeating pattern this trade represents]

Keep under ${wordLimit} words${grade ? ' if graded' : ''}. No hedging.`

    return prompt
  }

  const analyzeJournal = async () => {
    const grade = computeGrade()
    setGradeResult(grade)
    setOutput('')
    setStreaming(true)
    setStatusMsg('')

    const userContent = []

    // Add screenshots as base64 images
    for (const ss of screenshots) {
      try {
        const buf = await ss.file.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
        const mediaType = ss.file.type || 'image/png'
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 }
        })
      } catch (e) {
        console.error('Failed to encode screenshot:', e)
      }
    }

    userContent.push({ type: 'text', text: buildUserPrompt(grade) })

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }]
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

  const saveEntry = async () => {
    setStatusMsg('Saving...')
    try {
      const grade = computeGrade()
      const tradeData = {
        ...form,
        ai_analysis: output || null,
        grade: grade?.grade || null,
        grade_score: grade?.score || null,
        criteria_checked: JSON.stringify(criteriaChecked),
        exec_entry: execScores.entry,
        exec_mgmt: execScores.mgmt,
        exec_patience: execScores.patience,
        exec_rules: execScores.rules,
        screenshot_paths: '[]'
      }

      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeData)
      })
      const trade = await res.json()

      // Upload screenshots if any
      if (screenshots.length > 0) {
        const formData = new FormData()
        formData.append('tradeId', trade.id)
        screenshots.forEach(ss => formData.append('screenshots', ss.file))
        const ssRes = await fetch('/api/screenshots/upload', {
          method: 'POST',
          body: formData
        })
        const ssData = await ssRes.json()

        // Update trade with screenshot paths
        await fetch(`/api/trades/${trade.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screenshot_paths: JSON.stringify(ssData.paths) })
        })
      }

      setStatusMsg('✓ Trade saved')
      setTimeout(() => setStatusMsg(''), 3000)
    } catch (err) {
      setStatusMsg('Error saving: ' + err.message)
    }
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [screenshots.length])

  return (
    <div>
      {/* Trade Details */}
      <div className="section-label">Trade Details</div>
      <div className="form-row cols-4">
        <div>
          <label>Date</label>
          <input type="date" value={form.date} onChange={e => updateForm('date', e.target.value)} />
        </div>
        <div>
          <label>Instrument</label>
          <select value={form.instrument} onChange={e => updateForm('instrument', e.target.value)}>
            {settings.instruments.map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label>Direction</label>
          <select value={form.direction} onChange={e => updateForm('direction', e.target.value)}>
            {settings.directions.map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label>Session</label>
          <select value={form.session} onChange={e => updateForm('session', e.target.value)}>
            {['London', 'NY AM', 'NY PM', 'Asia', 'Overnight'].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Prices */}
      <div className="form-row cols-4">
        <div>
          <label>Entry Price</label>
          <input type="number" step="any" value={form.entry_price} onChange={e => updateForm('entry_price', e.target.value)} />
        </div>
        <div>
          <label>Exit Price</label>
          <input type="number" step="any" value={form.exit_price} onChange={e => updateForm('exit_price', e.target.value)} />
        </div>
        <div>
          <label>Stop Loss</label>
          <input type="number" step="any" value={form.stop_price} onChange={e => updateForm('stop_price', e.target.value)} />
        </div>
        <div>
          <label>Contracts</label>
          <input type="number" value={form.contracts} onChange={e => updateForm('contracts', e.target.value)} />
        </div>
      </div>

      {/* Outcome */}
      <div className="form-row cols-3">
        <div>
          <label>Outcome</label>
          <select value={form.outcome} onChange={e => updateForm('outcome', e.target.value)}>
            {['Win', 'Loss', 'Breakeven', 'Scratch'].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label>R:R Achieved <span style={{ color: 'var(--muted)', fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>(auto)</span></label>
          <input type="number" step="any" value={form.rr} onChange={e => setForm(prev => ({ ...prev, rr: e.target.value }))} />
        </div>
        <div>
          <label>HTF Bias</label>
          <select value={form.htf_bias} onChange={e => updateForm('htf_bias', e.target.value)}>
            {['Bullish', 'Bearish', 'Neutral', 'Uncertain'].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* ICT Setup */}
      <div className="section-label">ICT Setup</div>
      <div className="form-row cols-2">
        <div>
          <label>Primary Setup</label>
          <div className="pill-select-wrap">
            {settings.setups.map(s => (
              <span
                key={s}
                className={`setup-pill ${form.setup === s ? 'selected' : ''}`}
                onClick={() => updateForm('setup', form.setup === s ? '' : s)}
              >{s}</span>
            ))}
          </div>
        </div>
        <div>
          <label>Timeframe</label>
          <select value={form.timeframe} onChange={e => updateForm('timeframe', e.target.value)}>
            {['15m', '5m', '3m', '1m', '4H', '1H', 'Daily'].map(v => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Narrative */}
      <div className="section-label">Trade Narrative</div>
      <textarea
        rows={4}
        placeholder="What did you see?"
        value={form.narrative}
        onChange={e => updateForm('narrative', e.target.value)}
      />

      {/* Execution + Hindsight */}
      <div className="form-row cols-2" style={{ marginTop: 16 }}>
        <div>
          <label>Execution Notes</label>
          <textarea
            rows={3}
            value={form.execution_notes}
            onChange={e => updateForm('execution_notes', e.target.value)}
          />
        </div>
        <div>
          <label>Hindsight</label>
          <textarea
            rows={3}
            value={form.hindsight}
            onChange={e => updateForm('hindsight', e.target.value)}
          />
        </div>
      </div>

      {/* Screenshots */}
      <div className="section-label">Screenshots</div>
      <div
        className={`screenshot-dropzone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        Drop chart screenshots here or click to browse
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
        />
      </div>
      {screenshots.length > 0 && (
        <>
          <div className="screenshot-grid">
            {screenshots.map((ss, i) => (
              <div key={i}>
                <div className="screenshot-thumb">
                  <span className="screenshot-index-badge">{i + 1}</span>
                  <img src={ss.url} alt={`Screenshot ${i + 1}`} />
                  <div className="screenshot-thumb-overlay">
                    <button onClick={() => setLightbox({ open: true, index: i })} title="View">⤢</button>
                    <button onClick={() => removeScreenshot(i)} title="Remove">✕</button>
                  </div>
                </div>
                <div className="screenshot-caption">
                  <input
                    placeholder="Caption..."
                    value={captions[i] || ''}
                    onChange={e => updateCaption(i, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="screenshot-counter">{screenshots.length} / 10 screenshots</div>
        </>
      )}

      {/* Grade Accordion */}
      <div className={`grade-accordion ${gradeOpen ? 'open' : ''}`}>
        <button className="grade-toggle" onClick={() => setGradeOpen(!gradeOpen)}>
          <span className="grade-chevron">›</span>
          <span className="grade-toggle-label">Grade this trade</span>
          <span className="grade-toggle-hint">Optional — adds A–F score to your analysis</span>
        </button>
        <div className="grade-body">
          <div className="section-label">ICT Criteria</div>
          <div className="criteria-grid">
            {settings.criteria.map(item => (
              <div
                key={item}
                className={`criteria-item ${criteriaChecked.includes(item) ? 'checked' : ''}`}
                onClick={() => toggleCriteria(item)}
              >
                <span className="check">{criteriaChecked.includes(item) ? '✓' : ''}</span>
                {item}
              </div>
            ))}
          </div>

          <div className="section-label" style={{ marginTop: 20 }}>Execution Scores</div>
          {[
            { key: 'entry', label: 'Entry Precision' },
            { key: 'mgmt', label: 'Trade Management' },
            { key: 'patience', label: 'Patience' },
            { key: 'rules', label: 'Rule Adherence' },
          ].map(({ key, label }) => (
            <div key={key} className="slider-row">
              <span className="slider-label">{label}</span>
              <input
                type="range"
                min="1"
                max="10"
                value={execScores[key]}
                onChange={e => setExecScores(prev => ({ ...prev, [key]: Number(e.target.value) }))}
              />
              <span className="slider-val">{execScores[key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="action-row">
        <button className="btn btn-primary" onClick={analyzeJournal} disabled={streaming}>
          {streaming ? 'Analyzing...' : 'Print This Trade'}
        </button>
        <button className="btn btn-ghost" onClick={saveEntry}>Save Entry</button>
        {statusMsg && <span className="status-msg">{statusMsg}</span>}
      </div>

      {/* Output */}
      {(output || streaming) && (
        <div className="output-container">
          <div className="output-header">
            <span className="output-title">IC3 Analysis</span>
            {streaming && <div className="spinner" />}
          </div>
          {gradeResult && <ScoreDisplay grade={gradeResult.grade} score={gradeResult.score} criteriaChecked={criteriaChecked} />}
          <div className="output-body" ref={outputRef}>
            {output}{streaming && <span className="cursor" />}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox.open && screenshots.length > 0 && (
        <Lightbox
          images={screenshots.map((ss, i) => ({ url: ss.url, caption: captions[i] || '' }))}
          currentIndex={lightbox.index}
          onClose={() => setLightbox({ open: false, index: 0 })}
          onNavigate={(i) => setLightbox({ open: true, index: i })}
        />
      )}
    </div>
  )
}
