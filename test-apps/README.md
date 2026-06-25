# Browser instrumentation test apps

Three minimal single-page apps — **React**, **Vue**, and **Angular** — used as test subjects for the Odigos [browser OpenTelemetry agent](../README.md).
Each app serves plain HTML (so the `odigos-browser-proxy` sidecar can inject the `agent.js` `<script>`) and exposes buttons that generate the signals the web auto-instrumentations capture:

- **document load** — emitted automatically on page load
- **fetch** — `fetch GET` and `fetch POST` buttons
- **XHR** — `XHR GET` button
- **user interaction** — every button click

The outbound calls hit `https://jsonplaceholder.typicode.com` from the end user's browser, so they work without any in-cluster networking.

## Layout

```
test-apps/
  react-app/      # Vite + React
  vue-app/        # Vite + Vue 3
  angular-app/    # Angular 18 (standalone, application builder)
  k8s/            # Deployment + Service per app (test-apps namespace)
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
