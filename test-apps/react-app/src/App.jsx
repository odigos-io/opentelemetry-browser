import { useState, useCallback } from 'react'

const API = 'https://jsonplaceholder.typicode.com'

export default function App() {
  const [count, setCount] = useState(0)
  const [log, setLog] = useState([])

  const append = useCallback((line) => {
    const ts = new Date().toLocaleTimeString()
    setLog((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 12))
  }, [])

  const fetchGet = useCallback(async () => {
    append('fetch GET /todos/1 ...')
    try {
      const res = await fetch(`${API}/todos/1`)
      const data = await res.json()
      append(`fetch GET ok: "${data.title}"`)
    } catch (e) {
      append(`fetch GET error: ${e.message}`)
    }
  }, [append])

  const fetchPost = useCallback(async () => {
    append('fetch POST /posts ...')
    try {
      const res = await fetch(`${API}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'otel', body: 'browser', userId: 1 }),
      })
      const data = await res.json()
      append(`fetch POST ok: created id ${data.id}`)
    } catch (e) {
      append(`fetch POST error: ${e.message}`)
    }
  }, [append])

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

  const xhrGet = useCallback(() => {
    append('XHR GET /users/1 ...')
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `${API}/users/1`)
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        append(`XHR GET ok: ${data.name}`)
      } catch {
        append('XHR GET ok (unparsed)')
      }
    }
    xhr.onerror = () => append('XHR GET error')
    xhr.send()
  }, [append])

  return (
    <main className="app">
      <header>
        <span className="badge react">React</span>
        <h1>Browser OpenTelemetry Test Subject</h1>
        <p>Click buttons to generate document-load, fetch, XHR, user-interaction, and backend-chain (browser -&gt; backend-1 -&gt; backend-2) spans.</p>
      </header>

      <section className="actions">
        <button onClick={fetchGet}>fetch GET</button>
        <button onClick={fetchPost}>fetch POST</button>
        <button onClick={xhrGet}>XHR GET</button>
        <button onClick={backendChain}>backend chain</button>
        <button onClick={() => { setCount((c) => c + 1); append(`counter -> ${count + 1}`) }}>
          counter: {count}
        </button>
      </section>

      <section className="log">
        <h2>Activity log</h2>
        <ul>
          {log.length === 0 && <li className="muted">No activity yet.</li>}
          {log.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      </section>
    </main>
  )
}
