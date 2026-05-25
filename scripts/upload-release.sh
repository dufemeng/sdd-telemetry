#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

sha256_value() {
  local file="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return
  fi

  shasum -a 256 "$file" | awk '{print $1}'
}

require_cmd gh
require_cmd git
require_cmd awk

VERSION="${VERSION:-$(git rev-parse --short HEAD)}"
TAG="${TAG:-deploy-${VERSION}}"
REPO="${REPO:-${GITHUB_REPOSITORY:-}}"

if [[ -z "$REPO" ]]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
fi
[[ -n "$REPO" ]] || die "无法识别 GitHub 仓库。请设置 REPO=owner/repo。"

ARTIFACT="${ARTIFACT:-$ROOT_DIR/dist/docker/sdd-telemetry-images-${VERSION}.tar.gz}"
CHECKSUM="${CHECKSUM:-${ARTIFACT}.sha256}"
BUNDLE="${BUNDLE:-$ROOT_DIR/dist/docker/sdd-telemetry-deploy-bundle-${VERSION}.tar.gz}"

[[ -f "$ARTIFACT" ]] || die "镜像包不存在：$ARTIFACT。请先运行 ./scripts/package-docker.sh。"
if [[ ! -f "$CHECKSUM" ]]; then
  checksum_value="$(sha256_value "$ARTIFACT")"
  printf '%s  %s\n' "$checksum_value" "$(basename "$ARTIFACT")" > "$CHECKSUM"
fi

if [[ ! -f "$BUNDLE" ]]; then
  VERSION="$VERSION" ARTIFACT="$ARTIFACT" CHECKSUM="$CHECKSUM" BUNDLE="$BUNDLE" \
    "$ROOT_DIR/scripts/bundle-docker-release.sh"
fi

assets=("$BUNDLE")

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  printf 'Uploading assets to existing release %s in %s\n' "$TAG" "$REPO"
  gh release upload "$TAG" "${assets[@]}" --repo "$REPO" --clobber
else
  printf 'Creating release %s in %s\n' "$TAG" "$REPO"
  gh release create "$TAG" "${assets[@]}" \
    --repo "$REPO" \
    --title "SDD Telemetry ${VERSION}" \
    --notes "Offline Docker images for SDD Telemetry ${VERSION}."
fi

printf '\nDone.\n'
printf 'REPO=%s\n' "$REPO"
printf 'VERSION=%s\n' "$VERSION"
printf 'TAG=%s\n' "$TAG"
printf 'BUNDLE=%s\n' "$BUNDLE"
printf 'DOWNLOAD_URL=https://github.com/%s/releases/download/%s/%s\n' "$REPO" "$TAG" "$(basename "$BUNDLE")"
