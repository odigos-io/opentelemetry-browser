#!/usr/bin/env bash
# Builds the browser-instrumentation test apps for linux/amd64 + linux/arm64,
# pushes them to Artifact Registry, and deploys them to the test-apps namespace.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REGISTRY="${REGISTRY:-us-central1-docker.pkg.dev/odigos-cloud/staging-components}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

apps=(
  "react:react-app:browser-otel-react:dev"
  "vue:vue-app:browser-otel-vue:dev"
  "angular:angular-app:browser-otel-angular:dev"
  "next:next-app:browser-otel-next:dev"
  "nuxt:nuxt-app:browser-otel-nuxt:dev"
  "sveltekit:sveltekit-app:browser-otel-sveltekit:dev"
  "backend-1:backend-1:browser-otel-backend-1:dev"
  "backend-2:backend-2:browser-otel-backend-2:dev"
)

for entry in "${apps[@]}"; do
  IFS=":" read -r name dir image tag <<<"$entry"
  full="${REGISTRY}/${image}:${tag}"
  echo "==> Building & pushing ${full} (${PLATFORMS})"
  docker buildx build --platform "${PLATFORMS}" -t "${full}" --push ${BUILDX_EXTRA:-} "${SCRIPT_DIR}/${dir}"
done

echo "==> Applying manifests"
kubectl apply -f "${SCRIPT_DIR}/k8s.yaml"

echo "==> Waiting for rollouts"
kubectl rollout status deploy/backend-2 -n test-apps --timeout=120s
kubectl rollout status deploy/backend-1 -n test-apps --timeout=120s
kubectl rollout status deploy/react-app -n test-apps --timeout=120s
kubectl rollout status deploy/vue-app -n test-apps --timeout=120s
kubectl rollout status deploy/angular-app -n test-apps --timeout=120s
kubectl rollout status deploy/next-app -n test-apps --timeout=180s
kubectl rollout status deploy/nuxt-app -n test-apps --timeout=180s
kubectl rollout status deploy/sveltekit-app -n test-apps --timeout=180s

echo
ALB="$(kubectl get ingress browser-test -n test-apps -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
if [[ -n "${ALB}" ]]; then
  echo "Shared ALB: http://${ALB}"
  echo "  http://${ALB}/react/"
  echo "  http://${ALB}/vue/"
  echo "  http://${ALB}/angular/"
  echo "  http://${ALB}/next/"
  echo "  http://${ALB}/nuxt/"
  echo "  http://${ALB}/sveltekit/"
  echo "  http://${ALB}/jaeger/"
else
  echo "All apps deployed to the test-apps namespace. Port-forward to open them:"
  echo "  kubectl port-forward svc/react-app     8081:80"
  echo "  kubectl port-forward svc/vue-app       8082:80"
  echo "  kubectl port-forward svc/angular-app   8083:80"
  echo "  kubectl port-forward svc/next-app      8084:3000"
  echo "  kubectl port-forward svc/nuxt-app      8085:3000"
  echo "  kubectl port-forward svc/sveltekit-app 8086:3000"
fi
