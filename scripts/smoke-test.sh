#!/usr/bin/env bash
# Smoke test for a deployed environment on the kind cluster.
#
# Usage: bash scripts/smoke-test.sh <staging|production>
#
# Verifies, for the given environment:
#   1. the deployment rolled out and all replicas are Ready;
#   2. GET /health returns HTTP 200;
#   3. the homepage loads and renders the expected title.
#
# Relies on the same kubeconfig resolution as scripts/deploy.sh.

set -euo pipefail

ENV_NAME="${1:?usage: scripts/smoke-test.sh <staging|production>}"
case "$ENV_NAME" in
  staging|production) ;;
  *) echo "unknown environment: $ENV_NAME (expected staging|production)" >&2; exit 1 ;;
esac

NAMESPACE="${ENV_NAME}-devsecops-demo"
DEPLOYMENT="${ENV_NAME}-devsecops-demo"
NODE_PORT="30080"
[ "$ENV_NAME" = "staging" ] && NODE_PORT="30081"

log() { echo "[smoke-test:$ENV_NAME] $*"; }

export KUBECONFIG="$HOME/.kube/config"

log "checking deployment rollout..."
kubectl rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=180s

READY=$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
REPLICAS=$(kubectl get deployment "$DEPLOYMENT" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
log "pods ready: $READY/$REPLICAS"
if [ "${READY:-0}" -ne "$REPLICAS" ]; then
  log "ERROR: not all replicas are ready" >&2
  exit 1
fi

NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
BASE_URL="http://${NODE_IP}:${NODE_PORT}"

log "waiting for HTTP on $BASE_URL ..."
for _ in $(seq 1 12); do
  if curl -fsS -o /dev/null --max-time 5 "$BASE_URL/health"; then
    break
  fi
  sleep 5
done
curl -fsS --max-time 10 "$BASE_URL/health"
echo
log "health check passed"

log "checking homepage title..."
curl -fsS --max-time 10 "$BASE_URL/" | grep -qi "<title>Coffee Shop"
log "homepage check passed"

log "smoke test PASSED for $ENV_NAME"
