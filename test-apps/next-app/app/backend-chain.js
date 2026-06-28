'use client'

import { useCallback, useState } from 'react'

export default function BackendChain() {
  const [log, setLog] = useState([])

  const append = useCallback((line) => {
    const ts = new Date().toLocaleTimeString()
    setLog((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 12))
  }, [])

  const backendChain = useCallback(async () => {
    append('backend chain GET /api/chain ...')
    try {
      const res = await fetch('/api/chain')
      const data = await res.json()
      append(`backend chain ok: ${data.service} -> ${data.downstream?.service}`)
    } catch (e) {
      append(`backend chain error: ${e.message}`)
    }
  }, [append])

  return (
    <section>
      <button
        onClick={backendChain}
        style={{
          padding: '0.6rem 1rem',
          borderRadius: 8,
          border: '1px solid #3b82f6',
          background: '#1d4ed8',
          color: 'white',
          fontSize: 15,
          cursor: 'pointer',
        }}
      >
        backend chain
      </button>

      <h2 style={{ fontSize: 16, marginTop: '1.5rem' }}>Activity log</h2>
      <ul style={{ paddingLeft: '1.2rem' }}>
        {log.length === 0 && <li style={{ opacity: 0.5 }}>No activity yet.</li>}
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </section>
  )
}
