# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities. Instead,
email the maintainers or file a confidential issue.

- Email: security@example.com
- GitLab: create a *Confidential issue* in this project.

You should include:

1. A description of the vulnerability and its impact.
2. Steps to reproduce it (PoC preferred).
3. Any suggested remediation.

We aim to acknowledge reports within **2 business days** and to ship a fix or a
mitigation plan within **10 business days** of confirmation.

## Security tooling

This project is scanned on every pipeline run:

- **SAST** — ESLint + eslint-plugin-security
- **Secret detection** — gitleaks
- **Dependency scanning** — npm audit + Retire.js
- **License compliance** — license-checker
- **IaC scanning** — KICS + tfsec (terraform, kubernetes manifests)
- **Container scanning** — Trivy (filesystem + image)
- **DAST** — OWASP ZAP (manual, against a deployed environment)

Findings are reported in the GitLab **Security tab** (`Secure > Security
Dashboard`). Developers must review and triage findings before merging.

## Secrets

- Never commit real secrets to the repository.
- All secrets are injected at runtime via GitLab CI/CD variables or Kubernetes
  Secrets (see `k8s/base/deployment.yaml`).
- The default `API_KEY` in `src/config.js` is a deliberately fake demo value used
  to demonstrate secret detection.
