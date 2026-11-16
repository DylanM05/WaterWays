#!/usr/bin/env bash
set -euo pipefail
# Scan the committed tree, including ignored-but-tracked files; never local .env files.
snapshot=$(mktemp -d)
trap 'rm -rf "$snapshot"' EXIT
git archive HEAD | tar -x -C "$snapshot"
gitleaks dir "$snapshot" --config .gitleaks.toml --redact --verbose --no-banner --exit-code 1
# Also catch secrets added and removed within a push. Existing pre-pipeline history
# is not an allowlist: it remains covered by the current-tree scan above.
base="${BEFORE_SHA:-}"
if [[ ! "$base" =~ ^[0-9a-f]{40}$ ]] || [[ "$base" == 0000000000000000000000000000000000000000 ]]; then
  base=f6406fa9ff3f0826614b119a7d279acbe6c89dbd
fi
git cat-file -e "$base^{commit}"
gitleaks git . --config .gitleaks.toml --redact --verbose --no-banner --exit-code 1 --log-opts="$base..HEAD"
