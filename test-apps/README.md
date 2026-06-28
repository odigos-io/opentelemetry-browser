# Browser instrumentation test apps

Test subjects for the Odigos [browser OpenTelemetry agent](../README.md), in two flavors:

- **Static SPAs** — **React**, **Vue**, **Angular**. Built to static files and served by nginx.
- **Server-side-rendered (SSR)** — **Next.js**, **Nuxt**, **SvelteKit**. A Node server renders the
  HTML per request and serves it to the browser.

In both flavors the `odigos-browser-proxy` sidecar injects the `agent.js` `<script>` into the
served HTML — the proxy injects into any `text/html` response, so it does not matter whether the
HTML comes from nginx (static) or a framework's SSR server.

Each app exposes buttons that generate the signals the web auto-instrumentations capture:

- **document load** — emitted automatically on page load
- **fetch** — `fetch GET` and `fetch POST` buttons
- **XHR** — `XHR GET` button
- **user interaction** — every button click
- **backend chain** — `backend chain` button (distributed trace across three services)

The `fetch`/`XHR` buttons hit `https://jsonplaceholder.typicode.com` directly from the end user's browser, so they work without any in-cluster networking.

## Distributed trace (browser → backend-1 → backend-2)

The **backend chain** button issues a **same-origin** `fetch('/api/chain')`. Each app proxies
`/api/` to `backend-1` (a standalone Node service), which in turn calls `backend-2`:

```
browser app  --(fetch /api/chain, same-origin)-->  backend-1  --(GET /work)-->  backend-2
```

Because the call is same-origin, the browser OpenTelemetry SDK propagates trace context
(`traceparent`) on the request. Each app forwards that header to `backend-1`, where Odigos
server-side auto-instrumentation continues the trace (and `backend-1` then calls `backend-2`). The
result is a **single trace in Jaeger spanning three services**: the browser app, `backend-1`, and
`backend-2`.

How each app exposes the same-origin `/api/` path differs by flavor:

| App         | Server          | `/api/` → backend-1 mechanism                                     |
| ----------- | --------------- | ----------------------------------------------------------------- |
| react/vue/angular | nginx     | `location /api/ { proxy_pass ...backend-1... }`                   |
| next-app    | `next start`    | `next.config.mjs` `rewrites()` (transparent proxy)               |
| nuxt-app    | Nitro           | `nuxt.config.ts` `routeRules` `{ proxy }`                        |
| sveltekit-app | adapter-node  | `src/routes/api/[...path]/+server.js` (forwards trace headers)   |

> The SSR apps run with the **browser** language override (see their `Source` CRs), so Odigos does
> not server-side instrument the Node process; the app server only proxies `/api/`, forwarding the
> browser's `traceparent` to `backend-1`.

> The backends are dependency-free Node `http` servers — Odigos auto-instruments the built-in
> `http` module, so no app-side OpenTelemetry code is required.

## Layout

```
test-apps/
  react-app/      # Vite + React        (static SPA, nginx)
  vue-app/        # Vite + Vue 3        (static SPA, nginx)
  angular-app/    # Angular 18          (static SPA, nginx)
  next-app/       # Next.js (App Router) (SSR, next start)
  nuxt-app/       # Nuxt 3              (SSR, Nitro)
  sveltekit-app/  # SvelteKit           (SSR, adapter-node)
  backend-1/      # standalone Node http server; calls backend-2
  backend-2/      # standalone Node http server; leaf of the chain
  k8s/            # Deployment + Service per app (+ Source for SSR apps), plus backends.yaml
  deploy.sh       # build images -> kind load -> kubectl apply
```

Static apps build to static files served by nginx; SSR apps build a Node server that renders HTML
per request. Both use a multi-stage Dockerfile.

## Build & deploy to kind

```bash
./deploy.sh
```

This builds `browser-otel-{react,vue,angular,next,nuxt,sveltekit}:dev` plus the two backends, loads
them into the `kind` cluster, and applies the manifests to the `test-apps` namespace.

## Open the apps

```bash
# Static SPAs (nginx, port 80):
kubectl port-forward svc/react-app     8081:80     # http://localhost:8081
kubectl port-forward svc/vue-app       8082:80     # http://localhost:8082
kubectl port-forward svc/angular-app   8083:80     # http://localhost:8083
# SSR apps (Node server, port 3000):
kubectl port-forward svc/next-app      8084:3000   # http://localhost:8084
kubectl port-forward svc/nuxt-app      8085:3000   # http://localhost:8085
kubectl port-forward svc/sveltekit-app 8086:3000   # http://localhost:8086
```

## Build a single app manually

```bash
docker build -t browser-otel-react:dev ./react-app
kind load docker-image browser-otel-react:dev --name kind
kubectl apply -f k8s/react.yaml
```
