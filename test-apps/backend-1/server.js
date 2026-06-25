// backend-1: the standalone backend the browser apps call (same-origin, via each app's nginx
// `/api/` proxy). It forwards to backend-2 using the built-in `http` client so Odigos
// auto-instruments both the incoming server span and the outgoing client span, propagating the
// trace context that arrived from the browser. No app-side OpenTelemetry code is needed.
const http = require('http')

const PORT = process.env.PORT || 3001
const SERVICE = 'backend-1'
// Default to the in-cluster backend-2 service (same namespace).
const BACKEND2_URL = process.env.BACKEND2_URL || 'http://backend-2:3002/work'

function getJSON(urlStr) {
  return new Promise((resolve, reject) => {
    const req = http.get(urlStr, (resp) => {
      let body = ''
      resp.on('data', (chunk) => (body += chunk))
      resp.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/chain')) {
    try {
      const downstream = await getJSON(BACKEND2_URL)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ service: SERVICE, downstream }))
    } catch (err) {
      res.statusCode = 502
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ service: SERVICE, error: String(err) }))
    }
    return
  }
  if (req.url.startsWith('/healthz')) {
    res.end('ok')
    return
  }
  res.statusCode = 404
  res.end('not found')
})

server.listen(PORT, () => console.log(`${SERVICE} listening on ${PORT}, downstream=${BACKEND2_URL}`))
