#!/usr/bin/env bash
# Installs the CLI tools needed by the DevSecOps pipeline into a local directory.
# Runs on the GitLab runner (shell executor) and requires NO root privileges.
#
# Usage: bash scripts/install-tools.sh [install-dir]
#   install-dir defaults to "$CI_PROJECT_DIR/.tools" (shared with other jobs via artifacts).
#
# Pinned versions are verified to exist; override with env vars if needed:
#   KUBECTL_VERSION, KUSTOMIZE_VERSION, HELM_VERSION, TERRAFORM_VERSION,
#   GITLEAKS_VERSION, TRIVY_VERSION, TFSEC_VERSION, KICS_VERSION

set -euo pipefail

TOOLS_DIR="${1:-${CI_PROJECT_DIR:-$PWD}/.tools}"
BIN_DIR="$TOOLS_DIR/bin"
mkdir -p "$BIN_DIR"

KUBECTL_VERSION="${KUBECTL_VERSION:-v1.30.0}"
KUSTOMIZE_VERSION="${KUSTOMIZE_VERSION:-v5.4.3}"
HELM_VERSION="${HELM_VERSION:-v3.15.3}"
TERRAFORM_VERSION="${TERRAFORM_VERSION:-1.9.5}"
GITLEAKS_VERSION="${GITLEAKS_VERSION:-v8.18.4}"
TRIVY_VERSION="${TRIVY_VERSION:-v0.73.0}"
TFSEC_VERSION="${TFSEC_VERSION:-v1.28.5}"
KICS_VERSION="${KICS_VERSION:-v2.1.20}"

log() { echo "[install-tools] $*"; }

fetch() {
  local url="$1" dest="$2"
  if [ -x "$dest" ]; then log "already present: $dest"; return 0; fi
  log "downloading $url"
  curl -fsSL --retry 3 -o "$dest.tmp" "$url"
  mv "$dest.tmp" "$dest"
}

untar() {
  local archive="$1"
  tar -xzf "$archive" -C "$BIN_DIR"
  rm -f "$archive"
}

unzip_() {
  local archive="$1"
  unzip -o -q "$archive" -d "$BIN_DIR"
  rm -f "$archive"
}

# --- kubectl ---
fetch "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" "$BIN_DIR/kubectl"
chmod +x "$BIN_DIR/kubectl"

# --- kustomize ---
ARCHIVE="$BIN_DIR/kustomize.tar.gz"
fetch "https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize/${KUSTOMIZE_VERSION}/kustomize_${KUSTOMIZE_VERSION}_linux_amd64.tar.gz" "$ARCHIVE"
untar "$ARCHIVE"; chmod +x "$BIN_DIR/kustomize"

# --- helm ---
ARCHIVE="$BIN_DIR/helm.tar.gz"
fetch "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz" "$ARCHIVE"
tar -xzf "$ARCHIVE" -C "$BIN_DIR" linux-amd64/helm
mv "$BIN_DIR/linux-amd64/helm" "$BIN_DIR/helm"
rm -rf "$BIN_DIR/linux-amd64" "$ARCHIVE"
chmod +x "$BIN_DIR/helm"

# --- terraform ---
ARCHIVE="$BIN_DIR/terraform.zip"
fetch "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" "$ARCHIVE"
unzip_ "$ARCHIVE"; chmod +x "$BIN_DIR/terraform"

# --- gitleaks (secret detection) ---
ARCHIVE="$BIN_DIR/gitleaks.tar.gz"
fetch "https://github.com/gitleaks/gitleaks/releases/download/${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" "$ARCHIVE"
untar "$ARCHIVE"; chmod +x "$BIN_DIR/gitleaks"

# --- trivy (container / fs vulnerability scanner) ---
ARCHIVE="$BIN_DIR/trivy.tar.gz"
fetch "https://github.com/aquasecurity/trivy/releases/download/${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" "$ARCHIVE"
untar "$ARCHIVE"; chmod +x "$BIN_DIR/trivy"

# --- tfsec (terraform static analysis) ---
ARCHIVE="$BIN_DIR/tfsec.tar.gz"
fetch "https://github.com/aquasecurity/tfsec/releases/download/${TFSEC_VERSION}/tfsec_${TFSEC_VERSION}_linux_amd64.tar.gz" "$ARCHIVE"
untar "$ARCHIVE"; chmod +x "$BIN_DIR/tfsec"

# --- kics (IaC security) ---
ARCHIVE="$BIN_DIR/kics.tar.gz"
fetch "https://github.com/Checkmarx/kics/releases/download/${KICS_VERSION}/kics_${KICS_VERSION}_linux_amd64.tar.gz" "$ARCHIVE"
untar "$ARCHIVE"; chmod +x "$BIN_DIR/kics"

log "installed tools:"
for t in kubectl kustomize helm terraform gitleaks trivy tfsec kics; do
  "$BIN_DIR/$t" version 2>&1 | head -n 1 | sed "s/^/$t: /" || true
done

echo "$BIN_DIR" > "$TOOLS_DIR/.bin-path"
log "done. Add $BIN_DIR to PATH or read $TOOLS_DIR/.bin-path"
