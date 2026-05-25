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

require_cmd git
require_cmd tar

VERSION="${VERSION:-$(git rev-parse --short HEAD)}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/dist/docker}"
ARTIFACT="${ARTIFACT:-$OUTPUT_DIR/sdd-telemetry-images-${VERSION}.tar.gz}"
CHECKSUM="${CHECKSUM:-${ARTIFACT}.sha256}"
BUNDLE="${BUNDLE:-$OUTPUT_DIR/sdd-telemetry-deploy-bundle-${VERSION}.tar.gz}"

[[ -f "$ARTIFACT" ]] || die "镜像包不存在：$ARTIFACT。请先运行 pnpm docker:package。"
[[ -f "$CHECKSUM" ]] || die "镜像校验文件不存在：$CHECKSUM。请先运行 pnpm docker:package。"

mkdir -p "$(dirname "$BUNDLE")"
tar -czf "$BUNDLE" \
  -C "$(dirname "$ARTIFACT")" "$(basename "$ARTIFACT")" "$(basename "$CHECKSUM")" \
  -C "$ROOT_DIR" compose.prod.yml \
  -C "$ROOT_DIR/deploy" deploy-docker.sh

printf '\nDeployment bundle created.\n'
printf 'VERSION=%s\n' "$VERSION"
printf 'BUNDLE=%s\n' "$BUNDLE"
printf 'CONTENTS=%s,%s,compose.prod.yml,deploy-docker.sh\n' \
  "$(basename "$ARTIFACT")" "$(basename "$CHECKSUM")"
