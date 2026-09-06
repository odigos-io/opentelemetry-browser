// e2e harness — tiny stand-in for the browser gateway (CI/local only).
//
// Production gateway: injects external <script> tags, serves config.js + agent.js,
// and receives authenticated same-origin OTLP/HTTP then forwards to the collector.
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, normalize, extname } from 'node:path'
import { Readable } from 'node:stream'

export const AGENT_JS_PATH = '/__otel/agent.js'
export const CONFIG_JS_PATH = '/__otel/config.js'
export const TRACES_PATH = '/__otel/v1/traces'
export const LOGS_PATH = '/__otel/v1/logs'
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

function contentTypeFor(filePath) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function isHtml(contentType) {
  return !!contentType && contentType.toLowerCase().includes('text/html')
}

function buildSnippet() {
  return (
    `<script src="${CONFIG_JS_PATH}"></script>` +
    `<script src="${AGENT_JS_PATH}" async></script>`
  )
}

function buildConfigJs(serviceName, exportToken) {
  return `window.__ODIGOS__=${JSON.stringify({
    serviceName,
    tracesPath: TRACES_PATH,
    logsPath: LOGS_PATH,
    samplingRatio: 1,
    exportToken,
  })};`
}

function injectIntoHtml(html, snippet) {
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

function bearerToken(req) {
  const h = req.headers['authorization'] || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : ''
}

export function startHarness({
  port,
  serviceName,
  agentJsPath,
  otelHttpEndpoint,
  mode, // 'static' | 'proxy'
  staticDir,
  upstream,
  exportToken = randomBytes(24).toString('base64url'),
}) {
  const snippet = buildSnippet()
  const configJs = buildConfigJs(serviceName, exportToken)
  const stats = {
    traceRequests: 0,
    spansForwarded: 0,
    logRequests: 0,
    logsForwarded: 0,
    forwardErrors: 0,
    unauthorized: 0,
  }

  async function forwardOtlp(req, res, { collectorPath, requestKey, forwardKey }) {
    if (bearerToken(req) !== exportToken) {
      stats.unauthorized += 1
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }

    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks)
    stats[requestKey] += 1
    try {
      const upstreamRes = await fetch(`${otelHttpEndpoint}${collectorPath}`, {
        method: 'POST',
        headers: { 'content-type': req.headers['content-type'] || 'application/json' },
        body,
      })
      stats[forwardKey] += 1
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
        'x-content-type-options': 'nosniff',
      })
      res.end(buf)
    } catch (err) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end(`agent bundle not found at ${agentJsPath}: ${err}`)
    }
  }

  function serveConfig(res) {
    res.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'private, max-age=60',
      'x-content-type-options': 'nosniff',
    })
    res.end(configJs)
  }

  async function serveStatic(reqPath, res) {
    let rel = decodeURIComponent(reqPath.split('?')[0])
    if (rel === '/' || rel === '') rel = '/index.html'
    const safe = normalize(rel).replace(/^(\.\.[/\\])+/, '')
    let filePath = join(staticDir, safe)

    let info = await stat(filePath).catch(() => null)
    if (info && info.isDirectory()) {
      filePath = join(filePath, 'index.html')
      info = await stat(filePath).catch(() => null)
    }
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
    if (isHtml(type)) {
      const html = await readFile(filePath, 'utf8')
      const injected = injectIntoHtml(html, snippet)
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

    if (isHtml(type)) {
      const html = await upstreamRes.text()
      const injected = injectIntoHtml(html, snippet)
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

      if (path === CONFIG_JS_PATH) return serveConfig(res)
      if (path === AGENT_JS_PATH) return await serveAgent(res)
      if (path === TRACES_PATH && req.method === 'POST') {
        return await forwardOtlp(req, res, {
          collectorPath: '/v1/traces',
          requestKey: 'traceRequests',
          forwardKey: 'spansForwarded',
        })
      }
      if (path === LOGS_PATH && req.method === 'POST') {
        return await forwardOtlp(req, res, {
          collectorPath: '/v1/logs',
          requestKey: 'logRequests',
          forwardKey: 'logsForwarded',
        })
      }
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
        exportToken,
        getStats: () => ({ ...stats }),
        close: () => new Promise((r) => server.close(r)),
      })
    })
  })
}
