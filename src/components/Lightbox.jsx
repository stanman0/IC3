import React, { useEffect, useCallback } from 'react'

export default function Lightbox({ images, currentIndex, onClose, onNavigate }) {
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1)
    else if (e.key === 'ArrowRight' && currentIndex < images.length - 1) onNavigate(currentIndex + 1)
  }, [currentIndex, images.length, onClose, onNavigate])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!images || images.length === 0) return null

  const current = images[currentIndex]

  return (
    <div className="lightbox open" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}>✕</button>
      {currentIndex > 0 && (
        <button
          className="lightbox-nav prev"
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1) }}
        >‹</button>
      )}
      <img
        className="lightbox-img"
        src={current.url || current}
        alt={current.caption || ''}
        onClick={(e) => e.stopPropagation()}
      />
      {current.caption && (
        <div className="lightbox-caption">{current.caption}</div>
      )}
      {currentIndex < images.length - 1 && (
        <button
          className="lightbox-nav next"
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1) }}
        >›</button>
      )}
      <div className="lightbox-counter">{currentIndex + 1} / {images.length}</div>
    </div>
  )
}
