import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext(null)

const ICONS = { success: '\u2713', error: '\u2717', info: '\u2139' }

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const showToast = useCallback((type, message, duration = 3500) => {
    const id = ++idRef.current
    setToasts(prev => [...prev.slice(-3), { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
    }, duration)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type} ${t.exiting ? 'exiting' : ''}`}>
            <span className="toast-icon">{ICONS[t.type] || ''}</span>
            <span>{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)}>\u00d7</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
