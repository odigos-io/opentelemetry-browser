// e2e harness — a tiny stand-in for the odigos-browser-proxy sidecar, used only in CI/local e2e.
//
// In production, the odigos-browser-proxy sidecar (1) injects the agent <script> + window.__ODIGOS__
// into served HTML, (2) serves agent.js, and (3) receives the browser's OTLP/HTTP traces on a
// same-origin path and forwards them to the node-local collector. There is no k8s in CI, so this
// harness replicates exactly those three responsibilities in front of a framework test-app:
//
//   browser ─▶ harness ─▶ test-app (static files or an SSR server)
//                  │
//                  └─(POST /__otel/v1/traces)─▶ OpenTelemetry Collector (OTLP/HTTP)
//
// It supports two ways of serving the app:
//   - static: serve a built SPA directory (React/Vue/Angular `dist`) with SPA fallback.
//   - proxy:  reverse-proxy to an already-running SSR server (Next.js/Nuxt/SvelteKit).
//
// HTML responses get the agent snippet injected; everything else is passed through untouched.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, normalize, extname } from 'node:path'
import { Readable } from 'node:stream'

// Reserved, same-origin paths the harness owns (mirrors the proxy's /__odigos/ prefix).
export const AGENT_JS_PATH = '/__otel/agent.js'
export const TRACES_PATH = '/__otel/v1/traces'
export const WORK_PATH = '/__otel/work'
export const STATS_PATH = '/__otel/stats'

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] || 'application/octet-stream'
}

function isHTML(contentType) {
  return !!contentType && contentType.toLowerCase().includes('text/html')
}

// Build the inline config + loader snippet, identical in spirit to the sidecar's buildSnippet.
function buildSnippet(serviceName) {
  const config = {
    serviceName,
    tracesPath: TRACES_PATH,
    samplingRatio: 1,
  }
  return (
    `<script>window.__ODIGOS__=${JSON.stringify(config)};</script>` +
    `<script src="${AGENT_JS_PATH}" async></script>`
  )
}

// Inject the snippet at the earliest reasonable anchor (after <head>, else before </head>, etc.).
function injectIntoHTML(html, snippet) {
  const lower = html.toLowerCase()
  const headOpen = lower.indexOf('<head')
  if (headOpen >= 0) {
    const headEnd = lower.indexOf('>', headOpen)
    if (headEnd >= 0) return html.slice(0, headEnd + 1) + snippet + html.slice(headEnd + 1)
  }
  const headClose = lower.indexOf('</head>')
  if (headClose >= 0) return html.slice(0, headClose) + snippet + html.slice(headClose)
  const bodyOpen = lower.indexOf('<body')
  if (bodyOpen >= 0) {
    const bodyEnd = lower.indexOf('>', bodyOpen)
    if (bodyEnd >= 0) return html.slice(0, bodyEnd + 1) + snippet + html.slice(bodyEnd + 1)
  }
  return snippet + html
}

export function startHarness({
  port,
  serviceName,
  agentJsPath,
  otelHttpEndpoint,
  mode, // 'static' | 'proxy'
  staticDir,
  upstream,
}) {
  const snippet = buildSnippet(serviceName)
  const stats = { traceRequests: 0, spansForwarded: 0, forwardErrors: 0 }

  async function forwardOTLP(req, res) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks)
    stats.traceRequests += 1
    try {
      const upstreamRes = await fetch(`${otelHttpEndpoint}${TRACES_PATH.replace('/__otel', '')}`, {
        method: 'POST',
        headers: { 'content-type': req.headers['content-type'] || 'application/json' },
        body,
      })
      stats.spansForwarded += 1
      // Echo the collector's status so the browser exporter sees success/failure faithfully.
      res.writeHead(upstreamRes.status, { 'content-type': 'application/json' })
      res.end('{}')
    } catch (err) {
      stats.forwardErrors += 1
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  async function serveAgent(res) {
    try {
      const buf = await readFile(agentJsPath)
      res.writeHead(200, {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(buf)
    } catch (err) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end(`agent bundle not found at ${agentJsPath}: ${err}`)
    }
  }

  async function serveStatic(reqPath, res) {
    // Resolve the request path within staticDir; fall back to index.html for SPA routes.
    let rel = decodeURIComponent(reqPath.split('?')[0])
    if (rel === '/' || rel === '') rel = '/index.html'
    const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '')
    let filePath = join(staticDir, safe)

    let info = await stat(filePath).catch(() => null)
    if (info && info.isDirectory()) {
      filePath = join(filePath, 'index.html')
      info = await stat(filePath).catch(() => null)
    }
    // SPA fallback: unknown route with no file extension -> index.html.
    if (!info) {
      if (extname(safe)) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
        return
      }
      filePath = join(staticDir, 'index.html')
      info = await stat(filePath).catch(() => null)
      if (!info) {
        res.writeHead(404, { 'content-type': 'text/plain' })
        res.end('not found')
        return
      }
    }

    const type = contentTypeFor(filePath)
    if (isHTML(type)) {
      const html = await readFile(filePath, 'utf8')
      const injected = injectIntoHTML(html, snippet)
      res.writeHead(200, {
        'content-type': type,
        'content-length': Buffer.byteLength(injected),
      })
      res.end(injected)
      return
    }
    res.writeHead(200, { 'content-type': type })
    createReadStream(filePath).pipe(res)
  }

  async function proxyToUpstream(req, res) {
    const targetUrl = `${upstream}${req.url}`
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) {
      const lk = k.toLowerCase()
      if (lk === 'host' || lk === 'connection' || lk === 'content-length') continue
      headers[k] = v
    }
    // Ask the SSR server for uncompressed HTML so we can inject without decompressing.
    headers['accept-encoding'] = 'identity'

    let body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      body = Buffer.concat(chunks)
    }

    let upstreamRes
    try {
      upstreamRes = await fetch(targetUrl, { method: req.method, headers, body, redirect: 'manual' })
    } catch (err) {
      res.writeHead(502, { 'content-type': 'text/plain' })
      res.end(`upstream error: ${err}`)
      return
    }

    const type = upstreamRes.headers.get('content-type') || ''
    const outHeaders = {}
    upstreamRes.headers.forEach((value, key) => {
      const lk = key.toLowerCase()
      if (lk === 'content-encoding' || lk === 'content-length' || lk === 'transfer-encoding') return
      outHeaders[key] = value
    })

    if (isHTML(type)) {
      const html = await upstreamRes.text()
      const injected = injectIntoHTML(html, snippet)
      outHeaders['content-length'] = Buffer.byteLength(injected)
      res.writeHead(upstreamRes.status, outHeaders)
      res.end(injected)
      return
    }

    res.writeHead(upstreamRes.status, outHeaders)
    if (upstreamRes.body) {
      Readable.fromWeb(upstreamRes.body).pipe(res)
    } else {
      res.end()
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const path = (req.url || '/').split('?')[0]

      if (path === AGENT_JS_PATH) return await serveAgent(res)
      if (path === TRACES_PATH && req.method === 'POST') return await forwardOTLP(req, res)
      if (path === WORK_PATH) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, at: Date.now() }))
        return
      }
      if (path === STATS_PATH) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(stats))
        return
      }

      if (mode === 'static') return await serveStatic(req.url || '/', res)
      return await proxyToUpstream(req, res)
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end(`harness error: ${err && err.stack ? err.stack : err}`)
    }
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        getStats: () => ({ ...stats }),
        close: () => new Promise((r) => server.close(r)),
      })
    })
  })
}
