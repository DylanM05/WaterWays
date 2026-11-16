#!/usr/bin/env bash
set -euo pipefail
snapshot=$(mktemp -d)
tag="waterways-ci-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
cleanup() {
  rm -rf "$snapshot"
  docker image rm "$tag-server" "$tag-client" >/dev/null 2>&1 || true
}
trap cleanup EXIT
git archive HEAD | tar -x -C "$snapshot"
# Public placeholder only: production settings are never needed for CI.
printf '%s\n' 'VITE_API_BASE_URL=https://api.example.invalid' \
  'VITE_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk' > "$snapshot/WaterWays/.env"
docker build --pull -t "$tag-server" "$snapshot/Server"
docker build --pull -t "$tag-client" "$snapshot/WaterWays"
trivy image --image-src docker --scanners vuln --severity HIGH,CRITICAL --exit-code 1 "$tag-server"
trivy image --image-src docker --scanners vuln --severity HIGH,CRITICAL --exit-code 1 "$tag-client"
