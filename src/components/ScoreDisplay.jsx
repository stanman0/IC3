import React from 'react'

export default function ScoreDisplay({ grade, score, criteriaChecked }) {
  const colorClass = score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low'
  const fillColor = score >= 80 ? 'var(--accent2)' : score >= 60 ? 'var(--accent)' : 'var(--danger)'

  return (
    <div className="score-display">
      <div className={`score-letter ${colorClass}`} style={{ color: fillColor }}>
        {grade}
      </div>
      <div className="score-details">
        <div className={`score-number ${colorClass}`}>{score}/100</div>
        <div className="score-bar-track">
          <div
            className="score-bar-fill"
            style={{ width: `${score}%`, background: fillColor }}
          />
        </div>
        {criteriaChecked && criteriaChecked.length > 0 && (
          <div className="score-tags">
            {criteriaChecked.slice(0, 5).map((c, i) => (
              <span key={i} className="tag tag-amber">{c}</span>
            ))}
            {criteriaChecked.length > 5 && (
              <span className="tag tag-amber">+{criteriaChecked.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
