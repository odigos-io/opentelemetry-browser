# Browser agent end-to-end tests

These tests verify that the built `agent.js` bundle actually produces and exports OpenTelemetry
traces when running inside a **real browser**, against **every supported framework** — both
client-side SPAs (React, Vue, Angular) and server-side-rendered apps (Next.js, Nuxt, SvelteKit).

They mirror the approach used by Odigos' server-side agents (PHP, Ruby): spin up an OpenTelemetry
Collector, generate traffic against an app instrumented with the agent, and assert the collector
received traces with the expected `service.name`.

## How it works

```
Playwright (chromium | firefox | webkit, headless)
        │  loads the page, generates fetch + click activity
        ▼
   harness.mjs  ── injects external config.js + agent.js script tags into HTML
        │      ── serves /__otel/config.js (window.__ODIGOS__ + exportToken)
        │      ── serves /__otel/agent.js (the built bundle)
        │      ── receives authenticated OTLP/HTTP on /__otel/v1/traces|logs
        │                         │
        │                         └──▶ OpenTelemetry Collector (debug exporter)
        ▼
   the test-app  (static SPA files, or a spawned SSR Node server)
```

Because there is no Kubernetes (and therefore no `odigos-browser-proxy`) in CI, `harness.mjs` is a
tiny stand-in that replicates the hardened gateway: CSP-safe script injection, config.js with
export token, bundle serving, and authenticated same-origin OTLP forwarding to the collector.

## Files

| File          | Responsibility                                                              |
| ------------- | --------------------------------------------------------------------------- |
| `apps.mjs`    | How to serve each framework (static dir, or SSR start command).             |
| `harness.mjs` | The stand-in proxy: agent injection, bundle serving, OTLP forwarding.       |
| `drive.mjs`   | Playwright: launch a browser, load the page, generate instrumented activity.|
| `run.mjs`     | Orchestrates one `(framework, browser)` case and reports pass/fail.         |

## Run locally

```bash
# 1. Build the agent bundle (from the repo root)
npm install && npm run build

# 2. Start a collector with a debug exporter
docker run -d --name otel-collector -p 4317:4317 -p 4318:4318 \
  -v "$PWD/e2e/collector-config.yaml:/etc/otelcol/config.yaml" \
  otel/opentelemetry-collector:latest --config /etc/otelcol/config.yaml

# 3. Install e2e deps + the browser you want
cd e2e && npm install && npx playwright install --with-deps chromium

# 4. Build the app under test (example: react / next)
( cd ../test-apps/react-app && npm install && npm run build )

# 5. Drive it
node run.mjs --framework react --browser chromium

# 6. Confirm traces landed in the collector
docker logs otel-collector 2>&1 | grep 'service.name: Str(browser-react-chromium)'
```

The same matrix runs automatically in CI — see `.github/workflows/tests.yaml`.
