import React, { useState, useEffect } from 'react'

const DEFAULT_INSTRUMENTS = [
  "ES", "NQ", "YM", "MES", "MNQ"
]

const DEFAULT_DIRECTIONS = [
  "Long", "Short"
]

const DEFAULT_SETUPS = [
  "Breaker Block", "Order Block", "FVG / IFVG", "Liquidity Sweep",
  "OTE (61.8–79%)", "Midnight Open Raid", "NY Open Kill Zone",
  "London Open Kill Zone", "Silver Bullet", "Power of 3",
  "NWOG / NDOG", "SSL / BSL Grab", "PD Array Reaction", "Displacement + Retracement"
]

const DEFAULT_CRITERIA = [
  "HTF bias aligned", "Kill zone timing", "Liquidity sweep present",
  "Displacement candle", "Market structure shift (MSS)", "Order block / Breaker identified",
  "FVG present", "PD array confluence", "Draw on liquidity clear",
  "Waited for retracement", "Entry at OTE (61.8–79%)", "SL below structure",
  "Partial at first target", "No news conflict", "Confirmed with LTF entry", "Avoided CE / chop zone"
]

const DEFAULT_BEHAVIORS = [
  "FOMO entry (chased price)", "Revenge traded after loss", "Exited early (fear)",
  "Held too long (greed)", "Oversized position", "Moved stop against rules",
  "Hesitated on valid setup", "Excessive screen staring", "Followed process fully", "Stayed calm during trade"
]

function EditableList({ title, items, onChange, defaults }) {
  const [newItem, setNewItem] = useState('')

  const addItem = () => {
    const val = newItem.trim()
    if (val && !items.includes(val)) {
      onChange([...items, val])
      setNewItem('')
    }
  }

  const removeItem = (index) => {
    onChange(items.filter((_, i) => i !== index))
  }

  const updateItem = (index, value) => {
    const updated = [...items]
    updated[index] = value
    onChange(updated)
  }

  const resetToDefaults = () => {
    if (window.confirm(`Reset ${title.toLowerCase()} to defaults?`)) {
      onChange([...defaults])
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">{title}</div>
      <div className="edit-list">
        {items.map((item, i) => (
          <div key={i} className="edit-row">
            <span className="edit-drag">⣿</span>
            <input
              value={item}
              onChange={(e) => updateItem(i, e.target.value)}
            />
            <button className="edit-del" onClick={() => removeItem(i)}>✕</button>
          </div>
        ))}
      </div>
      <div className="add-item-row">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder={`Add ${title.toLowerCase().slice(0, -1) || 'item'}...`}
        />
        <button className="add-item-btn" onClick={addItem}>+ Add</button>
      </div>
      <button className="reset-link" onClick={resetToDefaults}>Reset to defaults</button>
    </div>
  )
}

export default function Settings({ open, onClose, settings, onSettingsChange }) {
  const [localInstruments, setLocalInstruments] = useState(settings.instruments)
  const [localDirections, setLocalDirections] = useState(settings.directions)
  const [localSetups, setLocalSetups] = useState(settings.setups)
  const [localCriteria, setLocalCriteria] = useState(settings.criteria)
  const [localBehaviors, setLocalBehaviors] = useState(settings.behaviors)
  const [localMaxRiskTrade, setLocalMaxRiskTrade] = useState(settings.maxRiskPerTrade ?? '')
  const [localMaxRiskDay, setLocalMaxRiskDay] = useState(settings.maxRiskPerDay ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLocalInstruments(settings.instruments)
    setLocalDirections(settings.directions)
    setLocalSetups(settings.setups)
    setLocalCriteria(settings.criteria)
    setLocalBehaviors(settings.behaviors)
    setLocalMaxRiskTrade(settings.maxRiskPerTrade ?? '')
    setLocalMaxRiskDay(settings.maxRiskPerDay ?? '')
  }, [settings])

  const handleSave = () => {
    const maxRiskPerTrade = localMaxRiskTrade !== '' ? parseFloat(localMaxRiskTrade) : null
    const maxRiskPerDay = localMaxRiskDay !== '' ? parseFloat(localMaxRiskDay) : null
    const newSettings = {
      instruments: localInstruments,
      directions: localDirections,
      setups: localSetups,
      criteria: localCriteria,
      behaviors: localBehaviors,
      maxRiskPerTrade,
      maxRiskPerDay,
    }
    localStorage.setItem('ic3_instruments', JSON.stringify(localInstruments))
    localStorage.setItem('ic3_directions', JSON.stringify(localDirections))
    localStorage.setItem('ic3_setups', JSON.stringify(localSetups))
    localStorage.setItem('ic3_criteria', JSON.stringify(localCriteria))
    localStorage.setItem('ic3_behaviors', JSON.stringify(localBehaviors))
    localStorage.setItem('ic3_max_risk_trade', JSON.stringify(maxRiskPerTrade))
    localStorage.setItem('ic3_max_risk_day', JSON.stringify(maxRiskPerDay))
    onSettingsChange(newSettings)
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 800)
  }

  return (
    <>
      <div className={`settings-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`settings-panel ${open ? 'open' : ''}`}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-btn" onClick={onClose}>✕</button>
        </div>
        <div className="settings-body">
          <EditableList
            title="Instruments"
            items={localInstruments}
            onChange={setLocalInstruments}
            defaults={DEFAULT_INSTRUMENTS}
          />
          <EditableList
            title="Directions"
            items={localDirections}
            onChange={setLocalDirections}
            defaults={DEFAULT_DIRECTIONS}
          />
          <EditableList
            title="Primary Setups"
            items={localSetups}
            onChange={setLocalSetups}
            defaults={DEFAULT_SETUPS}
          />
          <EditableList
            title="Grade Criteria"
            items={localCriteria}
            onChange={setLocalCriteria}
            defaults={DEFAULT_CRITERIA}
          />
          <EditableList
            title="Trade Behaviors"
            items={localBehaviors}
            onChange={setLocalBehaviors}
            defaults={DEFAULT_BEHAVIORS}
          />

          <div className="settings-section">
            <div className="settings-section-title">Risk Management</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Max Risk Per Trade ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={localMaxRiskTrade}
                  onChange={e => setLocalMaxRiskTrade(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Max Risk Per Day ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={localMaxRiskDay}
                  onChange={e => setLocalMaxRiskDay(e.target.value)}
                  placeholder="e.g. 300"
                />
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
                Used to auto-grade the Risk Management execution score. Exceeding limits reduces the score proportionally.
              </div>
            </div>
          </div>
        </div>
        <div className="settings-footer">
          <button className="btn btn-primary" onClick={handleSave} style={{ width: '100%' }}>
            {saved ? '✓ Settings saved' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}

export { DEFAULT_INSTRUMENTS, DEFAULT_DIRECTIONS, DEFAULT_SETUPS, DEFAULT_CRITERIA, DEFAULT_BEHAVIORS }
