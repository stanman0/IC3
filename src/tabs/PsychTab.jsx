import React, { useState } from 'react'
import MarkdownContent from '../components/MarkdownContent'

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

const PSYCH_SYSTEM = `You are IC3 — a direct, empathetic but no-nonsense trading psychology coach. You understand the mental game of ICT trading: the patience required, the discipline of waiting for setups, the emotional toll of losses. You do not coddle. You give specific, actionable protocols. Use ## for section headers.`

export default function PsychTab({ settings }) {
  const [mood, setMood] = useState(null)
  const [confidence, setConfidence] = useState(null)
  const [behaviors, setBehaviors] = useState([])
  const [mentalState, setMentalState] = useState('')
  const [belief, setBelief] = useState('')
  const [commitment, setCommitment] = useState('')
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)

  const toggleBehavior = (b) => {
    setBehaviors(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])
  }

  const analyzePsych = async () => {
    const moodItem = MOODS.find(m => m.value === mood)
    const confItem = CONFIDENCE.find(c => c.value === confidence)

    setOutput('')
    setStreaming(true)

    const userPrompt = `Analyze the trading psychology for this session:
Pre-trade mood: ${moodItem?.label || 'Not set'} (${mood || 0}/5)
Confidence in bias: ${confItem?.label || 'Not set'} (${confidence || 0}/5)
Behaviors present: ${behaviors.length > 0 ? behaviors.join(', ') : 'None selected'}
Mental state during trade: ${mentalState || 'N/A'}
Underlying belief/fear: ${belief || 'N/A'}
Trader's commitment: ${commitment || 'N/A'}

## Psychological Pattern
## Root Cause
## Concrete Protocol (2-3 specific steps)
## Commitment Reinforcement (rewrite as "I am a trader who...")

Under 300 words. Direct, not harsh.`

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: PSYCH_SYSTEM,
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
      <div className="section-label">Pre-Trade State</div>
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
          <label>Confidence</label>
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

      <div className="section-label">Trade Behaviors</div>
      <div className="criteria-grid">
        {settings.behaviors.map(b => (
          <div
            key={b}
            className={`criteria-item ${behaviors.includes(b) ? 'checked' : ''}`}
            onClick={() => toggleBehavior(b)}
          >
            <span className="check">{behaviors.includes(b) ? '✓' : ''}</span>
            {b}
          </div>
        ))}
      </div>

      <div className="section-label">Reflection</div>
      <div className="form-row cols-1">
        <div>
          <label>Mental state during trade</label>
          <textarea rows={3} value={mentalState} onChange={e => setMentalState(e.target.value)} />
        </div>
      </div>
      <div className="form-row cols-2">
        <div>
          <label>Underlying belief / fear</label>
          <textarea rows={3} value={belief} onChange={e => setBelief(e.target.value)} />
        </div>
        <div>
          <label>Commitment for next session</label>
          <textarea rows={3} value={commitment} onChange={e => setCommitment(e.target.value)} />
        </div>
      </div>

      <div className="action-row">
        <button className="btn btn-primary" onClick={analyzePsych} disabled={streaming}>
          {streaming ? 'Analyzing...' : 'Analyze Psychology'}
        </button>
      </div>

      {(output || streaming) && (
        <div className="output-container">
          <div className="output-header">
            <span className="output-title">Psychology Analysis</span>
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
