import React, { useState, useEffect } from 'react'
import PreMarketTab from './tabs/PreMarketTab'
import WeeklyTab from './tabs/WeeklyTab'
import HistoryTab from './tabs/HistoryTab'
import Settings, { DEFAULT_INSTRUMENTS, DEFAULT_DIRECTIONS, DEFAULT_SETUPS, DEFAULT_CRITERIA, DEFAULT_BEHAVIORS } from './components/Settings'

function loadSettings() {
  try {
    const instruments = JSON.parse(localStorage.getItem('ic3_instruments')) || DEFAULT_INSTRUMENTS
    const directions = JSON.parse(localStorage.getItem('ic3_directions')) || DEFAULT_DIRECTIONS
    const setups = JSON.parse(localStorage.getItem('ic3_setups')) || DEFAULT_SETUPS
    const criteria = JSON.parse(localStorage.getItem('ic3_criteria')) || DEFAULT_CRITERIA
    const behaviors = JSON.parse(localStorage.getItem('ic3_behaviors')) || DEFAULT_BEHAVIORS
    const maxRiskPerTrade = JSON.parse(localStorage.getItem('ic3_max_risk_trade')) ?? null
    const maxRiskPerDay = JSON.parse(localStorage.getItem('ic3_max_risk_day')) ?? null
    return { instruments, directions, setups, criteria, behaviors, maxRiskPerTrade, maxRiskPerDay }
  } catch {
    return { instruments: DEFAULT_INSTRUMENTS, directions: DEFAULT_DIRECTIONS, setups: DEFAULT_SETUPS, criteria: DEFAULT_CRITERIA, behaviors: DEFAULT_BEHAVIORS, maxRiskPerTrade: null, maxRiskPerDay: null }
  }
}

const TABS = [
  { id: 'premarket', label: 'Pre-Market' },
  { id: 'history', label: 'Daily Trades' },
  { id: 'weekly', label: 'Weekly' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('premarket')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(loadSettings)

  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="logo">TradeForge</div>
          <div className="tagline">Forge yourself into the trader you can be</div>
        </div>
        <button className="settings-btn" onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙
        </button>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`panel ${activeTab === 'premarket' ? 'active' : ''}`}>
        <PreMarketTab settings={settings} />
      </div>
      <div className={`panel ${activeTab === 'weekly' ? 'active' : ''}`}>
        <WeeklyTab settings={settings} />
      </div>
      <div className={`panel ${activeTab === 'history' ? 'active' : ''}`}>
        <HistoryTab settings={settings} />
      </div>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  )
}
