# opentelemetry-browser

Odigos browser (web) OpenTelemetry agent. This repo builds a single, self-contained
`agent.js` bundle based on the [OpenTelemetry JS Web SDK](https://opentelemetry.io/docs/languages/js/getting-started/browser/)
and packages it into a minimal container image that the Odigos `odiglet` pulls into its
agents image (exposed at `/instrumentations/browser/agent.js`, mounted on nodes at
`/var/odigos/browser`).

Unlike Odigos' server-side agents (PHP, Ruby, Node.js, ...), the browser agent does not run
inside the pod. It runs in the **end user's browser**. Odigos delivers it by injecting a
`<script>` tag into HTML responses via the `odigos-browser-proxy` sidecar, which also proxies
the browser's OTLP/HTTP telemetry back to the node-local collector (same-origin, so no CORS or
public ingress is required).

## What the bundle does

On load, `agent.js`:

1. Reads runtime configuration from `window.__ODIGOS__` (injected by the sidecar before this script).
2. Initializes a `WebTracerProvider` with W3C trace-context propagation and a `BatchSpanProcessor`.
3. Exports traces over OTLP/HTTP to the same-origin path served by the sidecar (default `/__odigos/v1/traces`).
4. Registers the OpenTelemetry web auto-instrumentations (document load, fetch, XHR, user interaction).

### Configuration contract (`window.__ODIGOS__`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `serviceName` | string | page hostname | `service.name` resource attribute. |
| `tracesPath` | string | `/__odigos/v1/traces` | Same-origin OTLP/HTTP traces endpoint exposed by the sidecar. |
| `resourceAttributes` | object | `{}` | Extra resource attributes (e.g. `k8s.namespace.name`). |
| `propagateTraceHeaderCorsUrls` | string[] | same-origin | URLs that may receive trace-context headers. Wrap a value in `/.../` for a regex. |
| `samplingRatio` | number | `1` | Head sampling ratio in `[0, 1]`. |
| `debug` | boolean | `false` | Log diagnostics to the browser console. |

See [`src/config.ts`](src/config.ts).

## Build

```bash
npm install
npm run build      # emits dist/agent.js (+ source map)
npm run typecheck
```

## Container image

```bash
docker build -f release.Dockerfile -t browser-community .
```

The final image (`FROM scratch`) contains only `/instrumentations/browser/agent.js`
(and its source map), ready to be copied by the odiglet Dockerfile:

```dockerfile
COPY --from=public.ecr.aws/odigos/agents/browser-community:<version> \
     /instrumentations/browser /instrumentations/browser
```

## Local development with Kind

```bash
make deploy-dev    # builds the image and copies the bundle into kind-control-plane:/var/odigos/browser
```

## Releasing

Releases are cut via the `Tag and Release` GitHub Action, which builds and pushes
`public.ecr.aws/odigos/agents/browser-community:<version>` for linux/amd64 + linux/arm64.
