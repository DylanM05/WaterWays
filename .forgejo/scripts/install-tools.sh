#!/usr/bin/env bash
set -euo pipefail
# Release archives are verified against reviewed hashes, not a mutable remote checksum file.
tools_dir="${TOOLS_DIR:-${RUNNER_TEMP:-/tmp}/waterways-ci-tools}"
mkdir -p "$tools_dir"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) actionlint_platform=linux_amd64; actionlint_sha=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8; gitleaks_platform=linux_x64; gitleaks_sha=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb; trivy_platform=Linux-64bit; trivy_sha=bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf ;;
  Linux-aarch64) actionlint_platform=linux_arm64; actionlint_sha=325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6; gitleaks_platform=linux_arm64; gitleaks_sha=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080; trivy_platform=Linux-ARM64; trivy_sha=ab9d51f86e6a5fb936f605faff6b593ac51bc378fff4d3e8b9d58358b9c367c3 ;;
  Darwin-arm64) actionlint_platform=darwin_arm64; actionlint_sha=aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f; gitleaks_platform=darwin_arm64; gitleaks_sha=b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5; trivy_platform=macOS-ARM64; trivy_sha=ae7ea358326960406b703c77b2ac490190797d80b306b5b50c2a27221da0a5b8 ;;
  *) echo 'Unsupported scanner platform' >&2; exit 1 ;;
esac
install_tool() {
  local name="$1" url="$2" checksum="$3"
  curl --fail --location --retry 3 --max-time 180 "$url" -o "$tools_dir/$name.tar.gz"
  if command -v sha256sum >/dev/null; then
    printf '%s  %s\n' "$checksum" "$tools_dir/$name.tar.gz" | sha256sum -c -
  else
    printf '%s  %s\n' "$checksum" "$tools_dir/$name.tar.gz" | shasum -a 256 -c -
  fi
  tar -xzf "$tools_dir/$name.tar.gz" -C "$tools_dir" "$name"
  if [[ "$name" == actionlint ]]; then "$tools_dir/$name" -version; else "$tools_dir/$name" version; fi
}
install_tool gitleaks "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_${gitleaks_platform}.tar.gz" "$gitleaks_sha"
install_tool trivy "https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_${trivy_platform}.tar.gz" "$trivy_sha"
install_tool actionlint "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_${actionlint_platform}.tar.gz" "$actionlint_sha"
if [[ -n "${GITHUB_PATH:-}" ]]; then printf '%s\n' "$tools_dir" >> "$GITHUB_PATH"; fi
