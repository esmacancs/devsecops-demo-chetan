#!/usr/bin/env bash
# Deploy the built image to the kind cluster that runs on this runner host.
#
# Usage: bash scripts/deploy.sh <staging|production>
#
# Picks up everything it needs from CI env vars:
#   CI_REGISTRY_IMAGE, CI_COMMIT_SHORT_SHA  (set automatically by GitLab)
#   KUBE_CONFIG                             (optional; content of the kind
#                                           kubeconfig)
#   KIND_CLUSTER                            (optional; default demo-cluster)
#
# Kubeconfig resolution: KUBE_CONFIG variable -> $HOME/.kube/config ->
# common paths (/home/ubuntu, /root, /home/gitlab-runner,
# /var/lib/gitlab-runner) -> `kind get kubeconfig` regenerated from the live
# cluster.
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
KIND_CLUSTER="${KIND_CLUSTER:-demo-cluster}"

log() { echo "[deploy:$ENV_NAME] $*"; }

# ---- kubeconfig (CI variable -> common paths -> regenerate via kind) ----
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
  for candidate in \
    /home/ubuntu/.kube/config \
    /root/.kube/config \
    /home/gitlab-runner/.kube/config \
    /var/lib/gitlab-runner/.kube/config; do
    if [ -f "$candidate" ]; then
      mkdir -p "$HOME/.kube"
      cp "$candidate" "$HOME/.kube/config"
      chmod 600 "$HOME/.kube/config"
      log "copied kubeconfig from $candidate"
      return 0
    fi
  done
  # Last resort: regenerate the kubeconfig straight from the cluster. This works
  # no matter which user created the cluster, as long as the kind CLI is on PATH.
  if command -v kind >/dev/null 2>&1 && kind get clusters 2>/dev/null | grep -q "^${KIND_CLUSTER}$"; then
    mkdir -p "$HOME/.kube"
    kind get kubeconfig --name "$KIND_CLUSTER" > "$HOME/.kube/config"
    chmod 600 "$HOME/.kube/config"
    log "regenerated kubeconfig for kind cluster '$KIND_CLUSTER'"
    return 0
  fi
  log "ERROR: no kubeconfig found and kind cluster '$KIND_CLUSTER' is not reachable."
  log "Set the KUBE_CONFIG CI variable (content of the kind cluster's ~/.kube/config),"
  log "or ensure the kind CLI + kubeconfig are available to the runner user (run provision-runner once)."
  exit 1
}
setup_kubeconfig
export KUBECONFIG="$HOME/.kube/config"

log "verifying cluster access..."
kubectl cluster-info >/dev/null

# The base manifests use a neutral image reference (devsecops-demo:latest) so
# the overlay image transformer below can always match and pin the exact commit
# tag, no matter which registry CI_REGISTRY_IMAGE points at.
BASE_IMAGE_NAME="devsecops-demo"

# ---- make the image visible to the kind nodes ----
log "loading $IMAGE:$TAG into the kind cluster '$KIND_CLUSTER'..."
docker pull "$IMAGE:$TAG" >/dev/null 2>&1 || true
kind load docker-image "$IMAGE:$TAG" --name "$KIND_CLUSTER"

# ---- render the overlay with the exact commit tag (without dirtying the repo) ----
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r k8s "$WORK/k8s"
(
  cd "$WORK/k8s/overlays/$ENV_NAME"
  kustomize edit set image "$BASE_IMAGE_NAME=$IMAGE:$TAG"
)

log "applying $ENV_NAME overlay (image $IMAGE:$TAG)..."
kubectl apply -k "$WORK/k8s/overlays/$ENV_NAME"
kubectl rollout status "deployment/$DEPLOYMENT" -n "$NAMESPACE" --timeout=180s

log "deployed $ENV_NAME successfully: $IMAGE:$TAG"
