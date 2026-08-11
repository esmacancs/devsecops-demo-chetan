#!/usr/bin/env bash
# Deploy the built image to the kind cluster that runs on this runner host.
#
# Usage: bash scripts/deploy.sh <staging|production>
#
# Picks up everything it needs from CI env vars:
#   CI_REGISTRY_IMAGE, CI_COMMIT_SHORT_SHA  (set automatically by GitLab)
#   KUBE_CONFIG                             (optional; content of the kind
#                                           kubeconfig. If unset it falls back
#                                           to $HOME/.kube/config, then to
#                                           /home/ubuntu/.kube/config.)
#
# Because kind nodes run containerd inside their own VM, images built on the
# host are loaded into the cluster with `kind load docker-image` before the
# manifests are applied. The image tag is pinned to the pipeline commit SHA via
# a temporary overlay so the running pods are traceable to the exact build.

set -euo pipefail

ENV_NAME="${1:?usage: scripts/deploy.sh <staging|production>}"
case "$ENV_NAME" in
  staging|production) ;;
  *) echo "unknown environment: $ENV_NAME (expected staging or production)" >&2; exit 1 ;;
esac

IMAGE="${CI_REGISTRY_IMAGE:-registry.gitlab.com/csharma/devsecops-demo}"
TAG="${CI_COMMIT_SHORT_SHA:?CI_COMMIT_SHORT_SHA is not set}"
NAMESPACE="devsecops-demo"
DEPLOYMENT="devsecops-demo"

log() { echo "[deploy:$ENV_NAME] $*"; }

# ---- kubeconfig (CI variable -> runner home -> ubuntu home) ----
setup_kubeconfig() {
  if [ -n "${KUBE_CONFIG:-}" ]; then
    mkdir -p "$HOME/.kube"
    printf '%s' "$KUBE_CONFIG" > "$HOME/.kube/config"
    chmod 600 "$HOME/.kube/config"
    log "using KUBE_CONFIG CI variable"
    return 0
  fi
  if [ -f "$HOME/.kube/config" ]; then
    log "using $HOME/.kube/config"
    return 0
  fi
  if [ -f "/home/ubuntu/.kube/config" ]; then
    mkdir -p "$HOME/.kube"
    cp "/home/ubuntu/.kube/config" "$HOME/.kube/config"
    chmod 600 "$HOME/.kube/config"
    log "copied kubeconfig from /home/ubuntu/.kube/config"
    return 0
  fi
  log "ERROR: no kubeconfig found. Set the KUBE_CONFIG CI variable (content of the kind cluster's ~/.kube/config) or run provision-runner to copy it."
  exit 1
}
setup_kubeconfig
export KUBECONFIG="$HOME/.kube/config"

log "verifying cluster access..."
kubectl cluster-info >/dev/null

# ---- make the image visible to the kind nodes ----
log "loading $IMAGE:$TAG into the kind cluster..."
docker pull "$IMAGE:$TAG" >/dev/null 2>&1 || true
kind load docker-image "$IMAGE:$TAG"

# ---- render the overlay with the exact commit tag (without dirtying the repo) ----
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r k8s "$WORK/k8s"
(
  cd "$WORK/k8s/overlays/$ENV_NAME"
  kustomize edit set image "$IMAGE=$IMAGE:$TAG"
)

log "applying $ENV_NAME overlay (image $IMAGE:$TAG)..."
kubectl apply -k "$WORK/k8s/overlays/$ENV_NAME"
kubectl rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=180s

log "deployed $ENV_NAME successfully: $IMAGE:$TAG"
