import BackendChain from './backend-chain'

// Render on every request so the HTML (and the timestamp below) is produced server-side per visit.
export const dynamic = 'force-dynamic'

export default function Page() {
  const renderedAt = new Date().toISOString()
  return (
    <main style={{ maxWidth: 720, margin: '0 auto' }}>
      <span
        style={{
          display: 'inline-block',
          padding: '0.15rem 0.6rem',
          borderRadius: 999,
          background: '#111827',
          border: '1px solid #2d3a66',
          fontSize: 12,
          letterSpacing: 0.4,
        }}
      >
        Next.js · server-side rendered
      </span>
      <h1>Browser OpenTelemetry SSR Test Subject</h1>
      <p>
        This HTML was rendered on the server at <code>{renderedAt}</code>, then served to the
        browser where the Odigos agent runs.
      </p>
      <p>
        The <strong>backend chain</strong> button issues a same-origin <code>/api/chain</code>{' '}
        request. Next.js rewrites it to <code>backend-1</code>, which calls <code>backend-2</code> —
        producing a single trace across three services.
      </p>
      <BackendChain />
    </main>
  )
}
