# Data flow

End-to-end path of configuration and telemetry for Odigos browser instrumentation.

## 1. Build & distribute `agent.js`

```
opentelemetry-browser (this repo)
  npm run build  →  dist/agent.js
  release.Dockerfile  →  image with /instrumentations/browser/agent.js
       │
       ├─▶ odiglet image (k8s) copies into node path /var/odigos/browser
       └─▶ vm-agent image copies into /instrumentations/browser
```

The bundle is static. Per-workload values are **not** baked in; they arrive at runtime
via `window.__ODIGOS__` from `/__odigos/config.js`.

## 2. Page load (delivery)

```
Browser                    Gateway                         App
   │  GET /page               │                              │
   │─────────────────────────▶│  GET /page                   │
   │                          │─────────────────────────────▶│
   │                          │◀──── text/html (+gzip) ──────│
   │                          │  decompress → inject tags →
   │                          │  recompress gzip if needed
   │◀── HTML with             │
   │    <script src=/__odigos/config.js>
   │    <script src=/__odigos/agent.js async>
   │
   │  GET /__odigos/config.js │
   │─────────────────────────▶│  dynamic JS assigning
   │◀── window.__ODIGOS__=…   │  exportToken + paths
   │
   │  GET /__odigos/agent.js  │
   │─────────────────────────▶│  static file from agent dir
   │◀── agent.js              │
   │
   │  agent start() reads window.__ODIGOS__
```

### `window.__ODIGOS__` fields used at runtime

| Field | Purpose |
| --- | --- |
| `serviceName` | `service.name` resource attribute |
| `tracesPath` / `logsPath` | Same-origin OTLP/HTTP paths on the gateway |
| `exportToken` | Bearer token required on OTLP POSTs |
| `resourceAttributes` | Extra resource attributes |
| `propagateTraceHeaderCorsUrls` | Fetch/XHR trace-context targets |
| `samplingRatio` | Head sampler ratio |
| `debug` | Console diagnostics |

## 3. Telemetry export (collection)

```
Browser                         Gateway                              Collector
   │  POST /__odigos/v1/traces     │                                     │
   │  Authorization: Bearer <tok>  │                                     │
   │  Content-Type: …              │                                     │
   │──────────────────────────────▶│  1. OPTIONS/CORS (strict)            │
   │                               │  2. Validate Bearer token            │
   │                               │  3. Rate-limit (IP + token)          │
   │                               │  4. Enforce body size cap            │
   │                               │  5. Same-site Origin/Referer check   │
   │                               │  POST /v1/traces                     │
   │                               │─────────────────────────────────────▶│
   │◀──────── status ──────────────│◀──────── status ─────────────────────│
```

Logs use `/__odigos/v1/logs` with the same auth and limits.

The gateway **strips** the browser `Authorization` header before forwarding to the
collector (the node-local collector is not public and does not expect that token).

## 4. Distributed tracing stitch

Fetch/XHR instrumentations attach W3C `traceparent` / `tracestate` to backends listed
in `propagateTraceHeaderCorsUrls` (default: same-origin only). Backend services
instrumented by Odigos continue the trace, so browser spans and server spans share a
`trace_id`.

## Reserved paths

| Path | Owner | Auth |
| --- | --- | --- |
| `/__odigos/config.js` | Gateway | Public (contains token; short cache) |
| `/__odigos/agent.js` | Gateway | Public (static SDK) |
| `/__odigos/healthz` | Gateway (k8s) | Public (probes only) |
| `/__odigos/v1/*` | Gateway → collector | **Bearer token + rate limit** |

Anything else is reverse-proxied to the upstream web server.
