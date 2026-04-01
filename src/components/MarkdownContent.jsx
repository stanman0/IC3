import React from 'react'
import ReactMarkdown from 'react-markdown'

export default function MarkdownContent({ children }) {
  if (!children) return null
  return (
    <div className="md-content">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  )
}
