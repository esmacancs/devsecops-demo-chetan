# DevSecOps Demo

An end-to-end **DevSecOps** reference project: a small Node.js/Express API that is
built, tested and secured by a GitLab CI/CD pipeline, deployed to Kubernetes with
infrastructure managed as code, and guarded by a full suite of automated security
scans at every stage.

> GitLab repo: https://gitlab.odp.om/csharma/devsecops-demo

## Architecture

```
                             ┌──────────────────────────────────────────────┐
  Merge request ─────────────►│              GitLab CI/CD                   │
                             │  (shell executor: opn-prime VM)             │
                             ├──────────────────────────────────────────────┤
                             │ .pre   provision-runner  (manual, one-time: │
                             │        installs Node, Docker, scanners, CLIs)│
                             │ test   jest unit/integration + coverage     │
                             │ sec.   SAST (eslint)                        │
                             │        Secret detection (gitleaks)          │
                             │        Dependency scan (npm audit/retire)   │
                             │        License compliance (license-checker) │
                             │        IaC scan (KICS + tfsec)              │
                             │        Container/fs scan (Trivy)            │
                             │        DAST API (ZAP, manual)               │
                             │ pack.   build & push image (manual)         │
                             │ scan   Trivy image scan (manual)            │
                             │ deploy  staging / production (manual)       │
                             └──────────────┬───────────────────────────────┘
                                            │
                         ┌──────────────────▼──────────────────┐
                         │  Docker image → registry             │
                         │  kubectl + kustomize → EKS cluster   │
                         │  Terraform → ECR + EKS (IaC)         │
                         └──────────────────────────────────────┘
```

## Project layout

```
.
├── .gitlab-ci.yml            # Full DevSecOps pipeline
├── scripts/
│   ├── install-tools.sh      # Downloads scanner/deploy CLIs (no root)
│   └── provision-runner.sh   # Installs Node.js, Docker + CLIs on runner (sudo)
├── src/                      # Express API (app, routes, middleware, store)
├── tests/                    # Jest + supertest unit/integration tests
├── openapi.yaml              # API contract, consumed by DAST API scan
├── Dockerfile                # Multi-stage, non-root, read-only FS
├── k8s/
│   ├── base/                 # Kustomize base (deployment, service, ingress…)
│   └── overlays/             # staging + production patches
├── terraform/                # AWS ECR + EKS as code (tfsec/KICS scanned)
└── .pre-commit-config.yaml   # Local hooks (gitleaks, eslint)
```

## Run locally

Requires Node 18+.

```bash
npm install
npm test          # unit + integration tests with coverage
npm run dev       # start the API on :3000
```

Try it:

```bash
curl -s http://localhost:3000/health
curl -s -H "X-API-Key: <your key>" http://localhost:3000/api/todos
```

> The default `API_KEY` is a **fake demo value** stored in `src/config.js`. It is
> intentionally hardcoded so the Secret Detection scan (gitleaks) has a finding to
> demonstrate. In production, inject it via a CI/CD secret.

### Docker

```bash
docker build -t devsecops-demo .
docker run --rm -p 3000:3000 devsecops-demo
```

## CI/CD pipeline

The pipeline assumes a **shell executor** (GitLab runner on the `opn-prime` VM). Run
the one-time **`provision-runner`** job so Node.js, Docker and the scanner/deploy
CLIs are installed on the host — the automatic jobs then just use them.

| Job | Stage | Runs | Tool | Gating |
|-----|-------|------|------|--------|
| `provision-runner` | `.pre` | manual (once) | installs Node.js 20, npm, Docker, kubectl, kustomize, helm, terraform, gitleaks, trivy, tfsec, kics | requires sudo |
| `test` | test | always | jest + supertest | hard |
| `sast-eslint` | security | always | ESLint + eslint-plugin-security | report only |
| `secret-detection` | security | always | gitleaks | report only |
| `dependency-scanning` | security | always | npm audit + Retire.js | report only |
| `license-compliance` | security | always | license-checker | report only |
| `sast-iac-kics` | security | always | KICS (tf + k8s) | report only |
| `sast-iac-tfsec` | security | always | tfsec (terraform) | report only |
| `container-scanning-fs` | security | always | Trivy filesystem | report only |
| `dast-api` | security | manual | ZAP against deployed URL | report only |
| `build-image` | package | manual | docker build + push to registry | after provisioning |
| `container-scanning-image` | scan | manual | Trivy image | report only |
| `deploy:staging` / `deploy:production` | deploy | manual | kubectl + kustomize | after provisioning |

Security jobs are non-blocking (`allow_failure: true` + `|| true`) so the pipeline
stays green while findings are visible in the **Security tab**. To turn any scan
into a hard gate, remove the `|| true` and `allow_failure` for that job.

### Enable the docker/deploy stages

1. Run **`provision-runner`** once (requires passwordless sudo for the runner user)
   — installs Node.js 20, npm, Docker Engine, kubectl, kustomize, helm, terraform
   and the gitleaks/trivy/tfsec/kics scanners, and grants the runner user docker
   + sudo access.
2. Add the `KUBE_CONFIG` CI variable (base64 kubeconfig for your cluster).
3. Set `DAST_TARGET_URL` to run the ZAP API scan against a deployed instance.

### Local security checks (pre-push)

```bash
npm run lint          # SAST
npm run audit         # dependency scan
npm run retire        # legacy dependency scan
npm run licenses      # license compliance
npm run secrets       # gitleaks secret detection (requires gitleaks in PATH)
```

`gitleaks` (and the other scanners) are installed on the runner host by
`scripts/provision-runner.sh`. `scripts/install-tools.sh` is an optional fallback
that downloads them into a local `.tools/bin` directory without root.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting policy.

## License

[MIT](LICENSE)
