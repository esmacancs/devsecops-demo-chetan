#!/usr/bin/env bash
# Provision the opn-prime GitLab runner host with Node.js 20, npm, Docker Engine,
# Compose, kubectl, helm, kustomize and terraform.
#
# This is the job you run ONCE from the CI pipeline (job: provision-runner)
# or manually. It REQUIRES root (sudo). Run: sudo bash scripts/provision-runner.sh
#
# It is idempotent: already-installed tools are skipped.

set -euo pipefail

log() { echo "[provision-runner] $*"; }

ensure_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log "re-executing with sudo..."
    exec sudo bash "$0"
  fi
}
ensure_root

detect_pkg() {
  if command -v apt-get >/dev/null 2>&1; then echo "apt";
  elif command -v dnf >/dev/null 2>&1; then echo "dnf";
  elif command -v yum >/dev/null 2>&1; then echo "yum";
  else echo "unknown"; fi
}

PKG_MGR="$(detect_pkg)"
log "package manager: $PKG_MGR"

install_pkg() { # install_pkg <pkg...>
  case "$PKG_MGR" in
    apt) apt-get update -qq && apt-get install -y -qq "$@";;
    dnf) dnf install -y -q "$@";;
    yum) yum install -y -q "$@";;
    *)   log "no supported package manager for: $*"; return 1;;
  esac
}

# Ensure basic tooling the rest of the script relies on
install_pkg curl unzip tar ca-certificates gnupg >/dev/null 2>&1 || true

# ---- Node.js + npm (required by the app's test / security jobs) ----
NODE_MAJOR="${NODE_MAJOR:-20}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt "$NODE_MAJOR" ]; then
  log "installing Node.js ${NODE_MAJOR}"
  case "$PKG_MGR" in
    apt)
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
      install_pkg nodejs
      ;;
    dnf|yum)
      install_pkg "nodejs${NODE_MAJOR}" || install_pkg nodejs
      ;;
  esac
else
  log "node already installed: $(node --version)"
fi
command -v npm >/dev/null 2>&1 || install_pkg npm || true

# ---- Docker Engine + Compose plugin ----
if ! command -v docker >/dev/null 2>&1; then
  log "installing Docker Engine"
  case "$PKG_MGR" in
    apt) curl -fsSL https://get.docker.com | sh;;
    dnf|yum)
      curl -fsSL https://download.docker.com/linux/centos/docker-ce.repo -o /etc/yum.repos.d/docker-ce.repo
      install_pkg docker-ce docker-ce-cli containerd.io docker-compose-plugin
      systemctl enable --now docker || true
      ;;
  esac
else
  log "docker already installed: $(docker --version)"
fi

if ! systemctl is-active --quiet docker 2>/dev/null; then
  log "starting docker daemon"
  systemctl enable --now docker >/dev/null 2>&1 || nohup dockerd >/var/log/dockerd.log 2>&1 &
  sleep 5
fi
docker version >/dev/null 2>&1 && log "docker daemon is up"

# Grant the GitLab runner user access to the docker socket (no sudo needed
# for pipeline docker jobs) and passwordless sudo (needed to re-run this
# script from CI), then restart the runner so the new group applies.
RUNNER_USER=""
for candidate in \
  "$(stat -c %U /etc/gitlab-runner/config.toml 2>/dev/null)" \
  "$(find /home -maxdepth 3 -name config.toml -path '*/.gitlab-runner/*' -printf '%u\n' 2>/dev/null | head -n1)" \
  "$(getent passwd gitlab-runner | cut -d: -f1)" \
  "$(getent passwd ubuntu | cut -d: -f1)"; do
  if [ -n "$candidate" ] && [ "$candidate" != "root" ]; then RUNNER_USER="$candidate"; break; fi
done
if [ -n "$RUNNER_USER" ]; then
  log "runner user detected: $RUNNER_USER"
  usermod -aG docker "$RUNNER_USER" || true
  log "granting passwordless sudo to $RUNNER_USER"
  echo "$RUNNER_USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/gitlab-runner-ci
  chmod 440 /etc/sudoers.d/gitlab-runner-ci
  log "restarting gitlab-runner (this may end the current job; installs are already complete)"
  systemctl restart gitlab-runner || true
else
  log "could not detect runner user; skipping docker group / sudo grant"
fi

# ---- CLI tools into /usr/local/bin ----
BIN=/usr/local/bin
KUBECTL_VERSION="${KUBECTL_VERSION:-v1.30.0}"
KUSTOMIZE_VERSION="${KUSTOMIZE_VERSION:-v5.4.3}"
HELM_VERSION="${HELM_VERSION:-v3.15.3}"
TERRAFORM_VERSION="${TERRAFORM_VERSION:-1.9.5}"

if ! command -v kubectl >/dev/null 2>&1; then
  log "installing kubectl ${KUBECTL_VERSION}"
  curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" -o "$BIN/kubectl"
  chmod +x "$BIN/kubectl"
fi

if ! command -v kustomize >/dev/null 2>&1; then
  log "installing kustomize ${KUSTOMIZE_VERSION}"
  curl -fsSL "https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize/${KUSTOMIZE_VERSION}/kustomize_${KUSTOMIZE_VERSION}_linux_amd64.tar.gz" | tar -xz -C /tmp
  install /tmp/kustomize "$BIN/kustomize" && rm -f /tmp/kustomize
fi

if ! command -v helm >/dev/null 2>&1; then
  log "installing helm ${HELM_VERSION}"
  curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz" | tar -xz -C /tmp
  install /tmp/linux-amd64/helm "$BIN/helm" && rm -rf /tmp/linux-amd64
fi

if ! command -v terraform >/dev/null 2>&1; then
  log "installing terraform ${TERRAFORM_VERSION}"
  curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" -o /tmp/tf.zip
  unzip -o -q /tmp/tf.zip -d /tmp && install /tmp/terraform "$BIN/terraform" && rm -f /tmp/tf.zip /tmp/terraform
fi

log "provisioning complete. Versions:"
node --version || true
npm --version || true
docker --version || true
kubectl version --client --short 2>/dev/null || kubectl version --client || true
kustomize version 2>/dev/null || true
helm version --short 2>/dev/null || true
terraform version 2>/dev/null || true
