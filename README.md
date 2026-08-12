# DevSecOps Demo

An end-to-end **DevSecOps** reference project: a responsive **Coffee Shop** website
(HTML/CSS/JS, from the open-source
[coffee-shop](https://github.com/sheikh92areeb/coffee-shop) project) served by a
small Node.js/Express server. It is built, tested and secured by a GitLab CI/CD
pipeline, deployed to Kubernetes with infrastructure managed as code, and guarded
by a full suite of automated security scans at every stage.

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
                              │ pack.   build & push image  (main, auto)    │
                              │ scan   Trivy image scan     (main, auto)    │
                              │ deploy  staging             (main, auto)    │
                              │ verify  smoke-test staging  (main, auto)    │
                              │ promote production          (manual gate)   │
                              └──────────────┬───────────────────────────────┘
                                             │
                          ┌──────────────────▼──────────────────┐
                          │  Docker image → registry             │
                          │  kind load → kind cluster on the    │
                          │  runner host                        │
                          │  staging :30081 | production :30080  │
                          └──────────────────────────────────────┘
```

## Project layout

```
.
├── .gitlab-ci.yml            # Full DevSecOps pipeline
├── scripts/
│   ├── install-tools.sh      # Downloads scanner/deploy CLIs (no root)
│   ├── provision-runner.sh   # Installs Node.js, Docker, kind + CLIs on runner (sudo)
│   ├── deploy.sh             # Loads image into kind + kubectl/kustomize apply
│   ├── smoke-test.sh         # Rollout + HTTP health/title checks per env
│   ├── npm-audit-to-gitlab.js # npm audit JSON → GitLab dependency_scanning schema
│   ├── trivy-to-gitlab.js    # trivy JSON → GitLab container_scanning schema
│   └── docker-preview.sh     # Runs the app on the runner host (:8080) for a visual check
├── src/                      # Express server (app, config, error handler)
├── public/                   # Coffee Shop site (index.html, assits/, img/)
├── tests/                    # Jest + supertest unit/integration tests
├── openapi.yaml              # API contract, consumed by DAST API scan
├── Dockerfile                # Multi-stage, non-root, read-only FS
├── k8s/
│   ├── base/                 # Kustomize base (deployment, service, ingress…)
│   └── overlays/             # staging + production (namePrefix isolates them)
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
```

### Web site

The app serves the **Coffee Shop** website (`public/`) so you can see it in a
browser instead of a terminal. Open `http://localhost:3000/` in a browser to view
the site (API clients hitting `/` without an HTML `Accept` header still get the
JSON service info). The site has home, about, menu, products, reviews, contact and
blogs sections.

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
| `provision-runner` | `.pre` | manual (once) | installs Node.js 20, npm, Docker, kind, kubectl, kustomize, helm, terraform, gitleaks, trivy, tfsec, kics | requires sudo |
| `test` | test | always | jest + supertest | hard |
| `sast-eslint` | security | always | ESLint + eslint-plugin-security | report only |
| `secret-detection` | security | always | gitleaks | report only |
| `dependency-scanning` | security | always | npm audit + Retire.js | report only |
| `license-compliance` | security | always | license-checker | report only |
| `sast-iac-kics` | security | always | KICS (tf + k8s) | report only |
| `sast-iac-tfsec` | security | always | tfsec (terraform) | report only |
| `container-scanning-fs` | security | always | Trivy filesystem | report only |
| `dast-api` | security | manual | ZAP against deployed URL | report only |
| `build-image` | package | `main` (auto) | docker build + push to registry | after provisioning |
| `container-scanning-image` | scan | `main` (auto) | Trivy image | report only |
| `docker-preview` / `docker-preview:stop` | preview | manual | run app in Docker on runner host (:8080) | needs Docker |
| `deploy:staging` | deploy | `main` (auto) | kind load + kubectl + kustomize | after provisioning |
| `smoke-test` | verify | `main` (auto) | rollout status + HTTP health/title check on staging | hard gate before promote |
| `deploy:production` | promote | `main` (manual) | kind load + kubectl + kustomize | only after smoke-test passes |

Security jobs are non-blocking (`allow_failure: true` + `|| true`) so the pipeline
stays green while findings are visible in the **Security tab**. To turn any scan
into a hard gate, remove the `|| true` and `allow_failure` for that job.

### Preview the app in Docker before deploying

Run the manual **`docker-preview`** job (stage `preview`, runs before `deploy`):
it builds the image locally and starts the app on **port 8080 of the runner host**
(`10.0.170.128`). Open it in a browser:

```text
http://10.0.170.128:8080/          # Coffee Shop website (open in a browser)
http://10.0.170.128:8080/health    # health check
```

When you are done, run the manual **`docker-preview:stop`** job to remove the
container.

### Enable the docker/deploy stages

1. Create the kind cluster on the runner host (once):

   ```bash
   kind create cluster --name demo-cluster
   ```

2. Run **`provision-runner`** once (requires passwordless sudo for the runner
   user) — installs Node.js 20, npm, Docker Engine, kind, kubectl, kustomize,
   helm, terraform and the gitleaks/trivy/tfsec/kics scanners, and grants the
   runner user docker + sudo access. If the kind kubeconfig lives under
   `/home/ubuntu/.kube/config`, it is copied for the runner user automatically.
3. If kubectl still cannot reach the cluster (different user/host), add a
   `KUBE_CONFIG` CI variable containing the cluster's kubeconfig (file type).
4. Set `DAST_TARGET_URL` to run the ZAP API scan against a deployed instance.

> On every push to `main`, the pipeline runs **automatically up to staging, then
> gates**: test → security scans → build & push image → Trivy image scan →
> `deploy:staging` → `smoke-test` (verifies staging) → **`deploy:production` is a
> manual promotion** that only becomes available after the staging smoke test
> passes. Staging and production are fully segregated on the same kind cluster —
> the overlays prefix every resource, so you get separate namespaces, deployments
> and pod names (`staging-devsecops-demo-*` vs `production-devsecops-demo-*`):
>
> ```text
> staging:    http://10.0.170.128:30081/   (NodePort; Coffee Shop)
> production: http://10.0.170.128:30080/   (NodePort; Coffee Shop)
> http://10.0.170.128:30080/health
> ```

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
