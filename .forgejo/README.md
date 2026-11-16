# WaterWays CI/CD

The pipeline runs on every branch push, nightly at 08:23 UTC, and on manual dispatch.
Only a push to `main` can deploy. Nightly and manual runs check code without deploying.

## Checks that block deployment

- **Tests and code quality**: Node 22, `npm ci` with install scripts disabled, server ESLint (no warnings), website ESLint (at most the five existing Fast Refresh warnings), server regression tests, website production build, and both full dependency audits. High/critical npm advisories fail; lower severities remain visible.
- **Secrets and static security**: Gitleaks scans all committed files plus new commit history, with values redacted. Semgrep uses the OWASP Top Ten community rules plus local rules against dynamic code execution and disabling TLS verification. Trivy scans dependency locks and Dockerfiles for high/critical findings.
- **Container build and vulnerabilities**: builds both actual Dockerfiles with public dummy frontend settings, then scans their OS and application dependencies. High/critical findings block even if no fix is available. Temporary image tags are removed afterward.
- **Production deployment**: rebuilds with production public frontend settings and re-scans those exact images before changing running containers. An outdated main commit is rejected. Compose updates containers without a preliminary `down`, waits for their health checks, and verifies that the server's database is connected. A failed health check fails the run.

Checks are gates, not a guarantee that code has no vulnerabilities. Human review remains needed for authorization, payment behavior and changes to the pipeline itself. Existing iOS source is not on `main`; Swift/Xcode builds need a separate macOS runner when that branch is integrated.

## Runner trust boundary

The current private repository uses an instance-level `ubuntu-latest` Docker runner that also controls production Docker. All repository writers and any other repositories allowed to use that runner must be trusted. The workflow deliberately has no `pull_request` or `pull_request_target` event: same-repository PR commits are checked by their branch pushes. Do not enable fork PR execution on this runner.

For contributions from untrusted authors, provision an ephemeral CI runner on a separate host/VM with no production Docker socket, production mounts, deploy credentials or production network access. Restrict the deployment runner to this repository and protected `main` workflows using the runner/instance policy; a workflow `if` is not a security boundary against a writer who can edit it. Move quality/security/container jobs to that CI runner label before enabling PR events.

After the first successful Forgejo run, protect `main` in repository Settings → Branches: require the quality, security and container checks shown by Forgejo, disable force pushes, and require PRs. Keep deployment out of required PR checks because it only runs after merge. This change does not silently alter repository access policy.

## Tools and findings

Checkout/setup-node actions are pinned to commit SHAs. Gitleaks 8.30.1 and Trivy 0.76.2 release downloads are verified with committed SHA-256 hashes; the Semgrep 1.185.0 container is pinned by digest. Node 22 and base images receive patch updates; installs use lockfiles. Scanner databases and the Semgrep community rule pack are refreshed at run time so nightly checks can detect newly published issues. They require outbound network access; download failures fail the check. Review scanner versions and hashes monthly.

Secret scans cover the complete current tree and each pushed commit range. New branches, manual runs and scheduled runs use the pipeline's initial main commit as the history boundary. Old history predating that boundary is not re-scanned on every run; it may contain previously exposed credentials that must be rotated separately. To run a one-time full history audit:

```sh
gitleaks git . --config .gitleaks.toml --redact --verbose --log-opts=--all
```

Do not disable rules to get a green check. Rotate real leaked secrets, update affected dependencies, or fix the code. The two exact Gitleaks exceptions are public Clerk keys used in tests; there is no broad test-directory exemption. Four narrow Semgrep suppressions explain cached JSON responses whose content type is explicitly set. Keep all future exceptions specific and documented.

Scan details and test output appear in each Forgejo job's logs. Gitleaks logs redact values. No SaaS scanning account or paid license is required, and code is not uploaded to the Semgrep service (`--metrics off`; local container execution). Enable Forgejo Actions failure notifications for your account to receive nightly failures.

## Deployment settings and recovery

Existing secrets are reused: `CLIENT_ENV_FILE`, `SERVER_ENV_FILE`, optional `MONGO_URI` override and `VITE_PUBLIC_CLERK_PUBLISHABLE_KEY`. Private credentials must never appear under a `VITE_` name in the client file. The pipeline rejects names containing SECRET, PRIVATE_KEY or PASSWORD. All client settings copied into a build must be public. Secrets are passed through step environment variables rather than interpolated into shell code, and temporary env files are removed in an always-run cleanup step.

A failing check leaves the existing deployment running. A failure after Compose starts replacing containers can leave a partially updated stack: there is no automatic rollback. Inspect health and fix forward or revert the offending commit through a reviewed PR; the revert runs the same gates and deploys. Database migrations require their own backwards-compatible deployment plan.

## Local verification

From a clean checkout of the commit being tested (the scanner scripts deliberately use committed files):

```sh
bash .forgejo/scripts/install-tools.sh
export PATH="/tmp/waterways-ci-tools:$PATH"
npm ci --prefix Server --ignore-scripts
npm ci --prefix WaterWays --ignore-scripts
npm run lint --prefix Server -- --max-warnings=0
npm run lint --prefix WaterWays -- --max-warnings=5
npm test --prefix Server
npm run build --prefix WaterWays
npm audit --prefix Server --audit-level=high
npm audit --prefix WaterWays --audit-level=high
bash .forgejo/scripts/scan-secrets.sh
bash .forgejo/scripts/scan-code.sh
bash .forgejo/scripts/check-images.sh
```

Use `export PATH="/tmp/waterways-ci-tools:$PATH"` for the installer's default directory on macOS/Linux, or set `TOOLS_DIR` explicitly. Docker is required for Semgrep and image checks. Local scans never read ignored `.env` files.
