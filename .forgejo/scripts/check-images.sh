#!/usr/bin/env bash
set -euo pipefail
snapshot=$(mktemp -d)
tag="waterways-ci-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
server_id=
client_id=
cleanup() {
  [[ -z "$server_id" ]] || docker rm -f "$server_id" >/dev/null 2>&1 || true
  [[ -z "$client_id" ]] || docker rm -f "$client_id" >/dev/null 2>&1 || true
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

# Smoke-test the final runtime after removing package managers, with networking
# disabled and no production credentials or database access.
server_id=$(docker run -d --network none -e ENABLE_SCHEDULER=false \
  -e STRIPE_SECRET_KEY=sk_test_unused "$tag-server")
client_id=$(docker run -d --network none "$tag-client")
for target in "$server_id:42069/health" "$client_id:5173/"; do
  container_id="${target%%:*}"
  endpoint="${target#*:}"
  docker exec "$container_id" node -e '
    (async () => {
      for (let n = 0; n < 20; n++) {
        try {
          const r = await fetch("http://127.0.0.1:" + process.argv[1], {signal: AbortSignal.timeout(1000)});
          if (r.ok) { console.log("Runtime HTTP smoke check passed"); return; }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      process.exit(1);
    })();' "$endpoint"
done
