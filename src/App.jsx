import React, { useState, useEffect } from 'react'
import JournalTab from './tabs/JournalTab'
import PsychTab from './tabs/PsychTab'
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
    return { instruments, directions, setups, criteria, behaviors }
  } catch {
    return { instruments: DEFAULT_INSTRUMENTS, directions: DEFAULT_DIRECTIONS, setups: DEFAULT_SETUPS, criteria: DEFAULT_CRITERIA, behaviors: DEFAULT_BEHAVIORS }
  }
}

const TABS = [
  { id: 'journal', label: 'Journal' },
  { id: 'psych', label: 'Psychology' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'history', label: 'History' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('journal')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(loadSettings)

  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="logo">IC<span>3</span></div>
          <div className="tagline">The tape doesn't lie.</div>
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

      <div className={`panel ${activeTab === 'journal' ? 'active' : ''}`}>
        <JournalTab settings={settings} />
      </div>
      <div className={`panel ${activeTab === 'psych' ? 'active' : ''}`}>
        <PsychTab settings={settings} />
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
