import React, { useState, useEffect, useCallback } from 'react'
import PreMarketTab from './tabs/PreMarketTab'
import WeeklyTab from './tabs/WeeklyTab'
import HistoryTab from './tabs/HistoryTab'
import PsychTab from './tabs/PsychTab'
import DailyStatsBar from './components/DailyStatsBar'
import IC3Chart from './components/IC3Chart/IC3Chart'
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
  { id: 'premarket', label: 'Pre-Market', key: '1' },
  { id: 'history', label: 'Daily Trades', key: '2' },
  { id: 'weekly', label: 'Weekly', key: '3' },
  { id: 'psych', label: 'Psychology', key: '4' },
  { id: 'chart', label: 'Chart', key: '5' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('premarket')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(loadSettings)
  const [allTrades, setAllTrades] = useState([])

  const fetchAllTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/trades')
      const data = await res.json()
      setAllTrades(data)
    } catch {}
  }, [])

  useEffect(() => { fetchAllTrades() }, [fetchAllTrades])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+1/2/3 — switch tabs
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const tab = TABS.find(t => t.key === e.key)
        if (tab) { e.preventDefault(); setActiveTab(tab.id); return }
      }
      // Escape — close settings
      if (e.key === 'Escape' && settingsOpen) {
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settingsOpen])

  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="logo">IC3</div>
          <div className="tagline">Trade Intelligence Journal</div>
        </div>
        <button className="settings-btn" onClick={() => setSettingsOpen(true)} title="Settings">
          {'\u2699'}
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
            <span className="kbd-hint">^{t.key}</span>
          </button>
        ))}
      </div>

      <DailyStatsBar trades={allTrades} maxRiskPerDay={settings.maxRiskPerDay} />

      <div className={`panel ${activeTab === 'premarket' ? 'active' : ''}`}>
        <PreMarketTab settings={settings} />
      </div>
      <div className={`panel ${activeTab === 'weekly' ? 'active' : ''}`}>
        <WeeklyTab settings={settings} />
      </div>
      <div className={`panel ${activeTab === 'history' ? 'active' : ''}`}>
        <HistoryTab settings={settings} onTradesChanged={fetchAllTrades} />
      </div>
      <div className={`panel ${activeTab === 'psych' ? 'active' : ''}`}>
        <PsychTab settings={settings} />
      </div>
      <div className={`panel ${activeTab === 'chart' ? 'active' : ''}`}>
        {activeTab === 'chart' && <IC3Chart symbol="ES" />}
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
