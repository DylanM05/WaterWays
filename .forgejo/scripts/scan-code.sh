#!/usr/bin/env bash
set -euo pipefail
# Copy only committed code over stdin. No production socket, env files, credentials,
# or host directory mounts enter the scanner container. Works with remote Docker daemons.
image='semgrep/semgrep:1.185.0@sha256:67518c174185a2043fdbed16c70631b79209499b3671178e7194379b48295a0d'
git archive HEAD | docker run --rm -i --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 256 --memory 2g --cpus 2 --workdir /src --entrypoint sh "$image" -c '
    tar -xf -
    exec semgrep scan --config p/owasp-top-ten --config .forgejo/security/semgrep.yml \
      --error --strict --metrics off --disable-version-check --no-git-ignore \
      --exclude "**/package-lock.json" --exclude "design/**" .
  '
