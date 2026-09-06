# Security controls (implementation)

Concrete controls shared by the k8s `odigos-browser-proxy` sidecar and the
vm-agent `BrowserProxyController`. The browser agent consumes the resulting
contract.

## 1. CSP-safe script injection

**Do not** inject inline scripts.

Injected markup:

```html
<script src="/__odigos/config.js"></script>
<script src="/__odigos/agent.js" async></script>
```

If the upstream `Content-Security-Policy` (or `-Report-Only`) contains a
`script-src` / `default-src` nonce, the gateway copies `nonce="<value>"` onto
both tags.

## 2. Export token on OTLP

- Gateway generates a cryptographically random token at process start (or loads
  `ODIGOS_BROWSER_PROXY_EXPORT_TOKEN` / vm equivalent when provided).
- Token is embedded in `config.js` as `exportToken`.
- Agent sends `Authorization: Bearer <exportToken>` on traces and logs exports.
- Gateway rejects OTLP requests without a matching bearer token (`401`).
- Gateway does **not** forward the bearer header to the collector.

## 3. Rate limiting

OTLP paths use a token-bucket limiter keyed by client IP and by token:

| Dimension | Default (v2) |
| --- | --- |
| Per client IP | 120 requests / minute |
| Per export token | 240 requests / minute |
| Max body size | 1 MiB (OTLP) |

Exceeded limits return `429`.

## 4. Same-site checks & CORS

For OTLP POST:

- If `Origin` is present, its host must match the request `Host` (ignore port
  differences for local dev only when both are loopback).
- Else if `Referer` is present, apply the same host match.
- Else allow (non-browser or privacy-restricted clients that still present a
  valid bearer) — rate limits still apply.
- CORS preflight echoes the request `Origin` only when it passes the same-site
  check; never `*`.
- `Access-Control-Allow-Headers` includes `authorization`, `content-type`, and
  W3C trace context headers.

## 5. Response headers for static assets

| Path | Headers |
| --- | --- |
| `/__odigos/agent.js` | `Content-Type: application/javascript`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=300` |
| `/__odigos/config.js` | same nosniff, `Cache-Control: private, max-age=60` |

## 6. Agent expectations

The agent **must**:

- Read `exportToken` from `window.__ODIGOS__` and attach the bearer header when set.
- Ignore its own OTLP URLs in network instrumentations (`resolveIgnoreUrls`).
- Default propagation targets to same-origin only.

The agent **must not** scrape passwords, cookies, or form inputs beyond what the
registered OpenTelemetry instrumentations emit.

## 7. Operator checklist

1. Enable browser instrumentation only on HTML-serving containers/sources you trust.
2. Ensure app CSP allows scripts from `'self'` (or add nonces / allow `/__odigos/`).
3. Keep the gateway in the request path healthy (k8s probes are mandatory).
4. Do not expose the node-local collector publicly; browsers should only talk to
   `/__odigos/v1/*` on the app origin.
