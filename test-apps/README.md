# Browser instrumentation test apps

Test subjects for the Odigos [browser OpenTelemetry agent](../README.md), in two flavors:

- **Static SPAs** — **React**, **Vue**, **Angular**. Built to static files and served by nginx.
- **Server-side-rendered (SSR)** — **Next.js**, **Nuxt**, **SvelteKit**. A Node server renders the
  HTML per request and serves it to the browser.

In both flavors the `odigos-browser-proxy` sidecar injects the `agent.js` `<script>` into the
served HTML — the proxy injects into any `text/html` response, so it does not matter whether the
HTML comes from nginx (static) or a framework's SSR server.

Each app exposes buttons that generate the signals the browser agent captures:

- **document load** — emitted automatically on page load (span)
- **fetch** — `fetch GET` and `fetch POST` buttons (span; transitional package)
- **XHR** — `XHR GET` button (span; transitional package)
- **user action** — every button click (event via `@opentelemetry/browser-instrumentation`)
- **navigation / timing / web vitals / errors** — event-based browser instrumentations
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

| App               | Server       | `/api/` → backend-1 mechanism                                  |
| ----------------- | ------------ | -------------------------------------------------------------- |
| react/vue/angular | nginx        | `location /api/ { proxy_pass ...backend-1... }`                |
| next-app          | `next start` | `next.config.mjs` `rewrites()` (transparent proxy)             |
| nuxt-app          | Nitro        | `nuxt.config.ts` `routeRules` `{ proxy }`                      |
| sveltekit-app     | adapter-node | `src/routes/api/[...path]/+server.js` (forwards trace headers) |

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
  k8s.yaml        # all Deployments, Services, and Sources
  deploy.sh       # build images -> push to Artifact Registry -> kubectl apply
```

Static apps build to static files served by nginx; SSR apps build a Node server that renders HTML
per request. Both use a multi-stage Dockerfile.

## Build & deploy

```bash
./deploy.sh
```

This builds `browser-otel-{react,vue,angular,next,nuxt,sveltekit}:dev` plus the two backends for
`linux/amd64` and `linux/arm64`, pushes them to Artifact Registry
(`us-central1-docker.pkg.dev/odigos-cloud/staging-components/`, pulled via
`staging-registry.odigos.io`), and applies the manifests to the `test-apps` namespace.

## Open the apps

Ingress is **host-based** on one shared ALB so each app owns `/` (and `/__odigos/*` for the
browser proxy). Hosts:

| Host                     | Service       |
| ------------------------ | ------------- |
| `react.browser-test`     | react-app     |
| `vue.browser-test`       | vue-app       |
| `angular.browser-test`   | angular-app   |
| `next.browser-test`      | next-app      |
| `nuxt.browser-test`      | nuxt-app      |
| `sveltekit.browser-test` | sveltekit-app |

Jaeger has its own Ingress/ALB in `destinations` (open that hostname directly — no `/etc/hosts` entry):

```bash
kubectl get ingress jaeger-ui -n destinations -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'; echo
```

```bash
ALB=$(kubectl get ingress browser-test -n test-apps -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
ALB_IP=$(dig +short "$ALB" | head -n1)
sudo tee -a /etc/hosts >/dev/null <<EOF
${ALB_IP} react.browser-test vue.browser-test angular.browser-test next.browser-test nuxt.browser-test sveltekit.browser-test
EOF
```

Then open `http://react.browser-test/`, etc. Same-origin `/api/chain` still goes through each
app’s nginx/SSR proxy to `backend-1`.

Smoke-test without editing hosts:

```bash
curl -sS -H 'Host: react.browser-test' "http://${ALB}/" | grep __odigos
curl -sS -H 'Host: react.browser-test' "http://${ALB}/__odigos/config.js"
```

Or port-forward locally:

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
IMAGE=us-central1-docker.pkg.dev/odigos-cloud/staging-components/browser-otel-react:dev
docker buildx build --platform linux/amd64,linux/arm64 -t "$IMAGE" --push ./react-app
kubectl apply -f k8s.yaml
```
