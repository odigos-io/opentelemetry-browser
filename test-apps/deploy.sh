#!/usr/bin/env bash
# Builds the three browser-instrumentation test apps as Docker images, loads them into the local kind cluster, and deploys them to the test-apps namespace.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLUSTER="${KIND_CLUSTER:-kind}"

apps=(
  "react:react-app:browser-otel-react:dev"
  "vue:vue-app:browser-otel-vue:dev"
  "angular:angular-app:browser-otel-angular:dev"
)

for entry in "${apps[@]}"; do
  IFS=":" read -r name dir image tag <<<"$entry"
  full="${image}:${tag}"
  echo "==> Building ${full}"
  docker build -t "${full}" "${SCRIPT_DIR}/${dir}-app"
  echo "==> Loading ${full} into kind cluster '${CLUSTER}'"
  kind load docker-image "${full}" --name "${CLUSTER}"
done

echo "==> Applying manifests"
kubectl create namespace test-apps || true
kubectl apply -f "${SCRIPT_DIR}/k8s/"

echo "==> Waiting for rollouts"
kubectl rollout status deploy/react-app -n test-apps --timeout=120s
kubectl rollout status deploy/vue-app -n test-apps --timeout=120s
kubectl rollout status deploy/angular-app -n test-apps --timeout=120s

echo
echo "All apps deployed to the test-apps namespace. Port-forward to open them:"
echo "  kubectl port-forward svc/react-app   8081:80   # http://localhost:8081"
echo "  kubectl port-forward svc/vue-app     8082:80   # http://localhost:8082"
echo "  kubectl port-forward svc/angular-app 8083:80   # http://localhost:8083"
