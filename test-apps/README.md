# Browser instrumentation test apps

Three minimal single-page apps — **React**, **Vue**, and **Angular** — used as test subjects for the Odigos [browser OpenTelemetry agent](../README.md).
Each app serves plain HTML (so the `odigos-browser-proxy` sidecar can inject the `agent.js` `<script>`) and exposes buttons that generate the signals the web auto-instrumentations capture:

- **document load** — emitted automatically on page load
- **fetch** — `fetch GET` and `fetch POST` buttons
- **XHR** — `XHR GET` button
- **user interaction** — every button click
- **backend chain** — `backend chain` button (distributed trace across three services)

The `fetch`/`XHR` buttons hit `https://jsonplaceholder.typicode.com` directly from the end user's browser, so they work without any in-cluster networking.

## Distributed trace (browser → backend-1 → backend-2)

The **backend chain** button issues a **same-origin** `fetch('/api/chain')`. Each app's nginx proxies
`/api/` to `backend-1` (a standalone Node service), which in turn calls `backend-2`:

```
browser app  --(fetch /api/chain, same-origin via nginx)-->  backend-1  --(GET /work)-->  backend-2
```

Because the call is same-origin, the browser OpenTelemetry SDK propagates trace context
(`traceparent`) on the request. Odigos server-side auto-instrumentation on the two Node backends
(opted in via their `Source` CRs in `k8s/backends.yaml`) continues that trace. The result is a
**single trace in Jaeger spanning three services**: the browser app, `backend-1`, and `backend-2`.

> The backends are dependency-free Node `http` servers — Odigos auto-instruments the built-in
> `http` module, so no app-side OpenTelemetry code is required.

## Layout

```
test-apps/
  react-app/      # Vite + React
  vue-app/        # Vite + Vue 3
  angular-app/    # Angular 18 (standalone, application builder)
  backend-1/      # standalone Node http server; calls backend-2
  backend-2/      # standalone Node http server; leaf of the chain
  k8s/            # Deployment + Service per app, plus backends.yaml (Deployments + Services + Sources)
  deploy.sh       # build images -> kind load -> kubectl apply
```

Each app builds to static files via a multi-stage Dockerfile and is served by nginx.

## Build & deploy to kind

```bash
./deploy.sh
```

This builds `browser-otel-{react,vue,angular}:dev`, loads them into the `kind` cluster, and applies the manifests to the `test-apps` namespace.

## Open the apps

```bash
kubectl port-forward svc/react-app   8081:80   # http://localhost:8081
kubectl port-forward svc/vue-app     8082:80   # http://localhost:8082
kubectl port-forward svc/angular-app 8083:80   # http://localhost:8083
```

## Build a single app manually

```bash
docker build -t browser-otel-react:dev ./react-app
kind load docker-image browser-otel-react:dev --name kind
kubectl apply -f k8s/react.yaml
```
