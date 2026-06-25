// backend-2: the deepest service in the chain. A dependency-free Node HTTP server so Odigos
// auto-instruments the built-in `http` server module without any app-side OpenTelemetry code.
// It is called by backend-1, which is itself called (same-origin) from the browser apps.
const http = require('http')

const PORT = process.env.PORT || 3002
const SERVICE = 'backend-2'

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/work')) {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ service: SERVICE, result: 42, at: new Date().toISOString() }))
    return
  }
  if (req.url.startsWith('/healthz')) {
    res.end('ok')
    return
  }
  res.statusCode = 404
  res.end('not found')
})

server.listen(PORT, () => console.log(`${SERVICE} listening on ${PORT}`))
