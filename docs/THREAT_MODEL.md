# Threat model & security design

Addresses production concerns raised against the original sidecar design
(unauthenticated OTLP relay, inline scripts vs CSP, same-origin agent trust, and
L7/iptables operational risk). See also [SECURITY.md](./SECURITY.md) for the
concrete controls implemented in the gateway and agent.

## Assets

| Asset | Sensitivity |
| --- | --- |
| End-user page (HTML/JS/cookies) | High — app origin |
| `agent.js` | Medium — runs with page origin privileges |
| `config.js` (incl. export token) | Medium — bearer for telemetry write path |
| Node-local / managed OTLP collector | High — cluster telemetry ingress |
| User telemetry payloads | Medium — may include URLs, user-agent, errors |

## Trust boundaries

```
Internet / end users
        │
        ▼
┌───────────────────────┐
│  Browser origin (app) │  ← agent.js executes here (same-origin by design)
└──────────┬────────────┘
           │ HTTPS to app host
           ▼
┌───────────────────────┐
│  Browser gateway      │  ← only component that may reach the collector
│  (/__odigos/*)        │
└──────────┬────────────┘
           │ cluster / localhost network
           ▼
┌───────────────────────┐
│  Odigos collector     │
└───────────────────────┘
```

## Threats and mitigations

### T1 — Unauthenticated OTLP flood into the collector (critical)

**Attack:** Anyone who can reach the app host POSTs unbounded OTLP to
`/__odigos/v1/*`, exhausting collector/destination capacity.

**Mitigations:**
- Require `Authorization: Bearer <exportToken>` minted into `config.js`.
- Per-IP and per-token rate limits on OTLP paths.
- Hard body size cap.
- Same-site `Origin` / `Referer` checks (reject cross-site blind POSTs).
- Strict CORS (never `Access-Control-Allow-Origin: *` on OTLP).

**Residual risk:** A client that loaded a real page obtains a valid token and can
abuse it until expiry/rotation. Rate limits bound the blast radius. Tokens are
**telemetry write credentials**, not session credentials.

### T2 — Inline config breaks Content-Security-Policy (high)

**Attack / breakage:** Injecting `<script>window.__ODIGOS__=…</script>` violates
CSP without `'unsafe-inline'`, breaking hardened frontends.

**Mitigations:**
- External `/__odigos/config.js` + `/__odigos/agent.js` only (compatible with
  `script-src 'self'`).
- When the upstream response CSP includes a `nonce-…`, propagate that nonce onto
  the injected tags.
- Document remaining CSP cases (hash-only `script-src`, strict nonces without
  `'self'`) as operator allow-list updates for `/__odigos/*.js`.

### T3 — Malicious or compromised `agent.js` (high, inherent to RUM)

**Attack:** Attacker replaces `agent.js` (supply chain or volume mount) and runs
arbitrary same-origin script (cookies, DOM, credentials).

**Mitigations:**
- Serve agent from the Odigos-controlled agents image path only.
- `X-Content-Type-Options: nosniff` and explicit `Content-Type`.
- Optional Subresource Integrity (`integrity=` on the agent script tag) computed
  from the on-disk bundle at gateway start.
- Agent code review / release signing of the container image (org-wide).
- Agent does not read passwords or scrape form fields; instrumentations are the
  standard OpenTelemetry browser set.

**Residual risk:** Any first-party analytics/RUM script has this trust model.
Zero-code injection makes the trust decision an **opt-in Source override**.

### T4 — Sidecar crash black-holes the app (high, k8s)

**Mitigations already in tree:** liveness + readiness on `/__odigos/healthz` so a
dead gateway fails the pod instead of silently dropping traffic.

### T5 — iptables / mesh collision (medium, operational)

**Mitigations:** skip injection when `istio-proxy` / `linkerd-proxy` is present;
document as unsupported with sidecar meshes. Transparent redirect remains the
k8s v1 mechanism; Service `targetPort` remapping is a tracked alternative that
avoids `NET_ADMIN` (see open questions).

### T6 — Token leakage via shared caches / CDNs

**Mitigations:** `Cache-Control: private, max-age=60` (or no-store) on
`config.js`. Tokens rotate when the gateway process restarts; short cache limits
replay windows.

## Non-goals

- Making browser RUM possible **without** running privileged script on the app
  origin (impossible for real RUM).
- Mutual TLS from browsers to the gateway (browsers cannot present cluster mTLS
  client certs usefully for anonymous users).
- Replacing customer WAF / edge rate limits.

## Alternatives considered

| Approach | Why not (for v2) |
| --- | --- |
| Public collector ingress + CDN-hosted agent | Requires public OTLP exposure, CORS, and customer edge config; loses zero-code same-origin delivery |
| Drop HTML injection; manual snippet only | Abandons Odigos zero-code value prop |
| Sidecar without OTLP relay (browser → remote) | Pushes auth/CORS onto every customer destination |
| Full mesh/WASM injection | Not portable across clusters; still L7 complexity |

v2 keeps the **hardened same-origin gateway** (sidecar / vm proxy) because it
preserves zero-code delivery while closing the concrete security gaps that blocked
the original design.
