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
require_cmd ssh
require_cmd scp

VERSION="${VERSION:-$(git rev-parse --short HEAD)}"
SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-project/sdd-telemetry-deploy}"
ARTIFACT="${ARTIFACT:-$ROOT_DIR/dist/docker/sdd-telemetry-images-${VERSION}.tar.gz}"
CHECKSUM="${CHECKSUM:-${ARTIFACT}.sha256}"

[[ -n "$SERVER" ]] || die "请设置 SERVER=user@host"
[[ -f "$ARTIFACT" ]] || die "镜像包不存在：$ARTIFACT"
[[ -f "$CHECKSUM" ]] || die "校验文件不存在：$CHECKSUM"

ssh "$SERVER" "mkdir -p '$REMOTE_DIR'"
scp \
  "$ARTIFACT" \
  "$CHECKSUM" \
  "$ROOT_DIR/compose.prod.yml" \
  "$ROOT_DIR/deploy/deploy-docker.sh" \
  "$SERVER:$REMOTE_DIR/"

printf '\nDone.\n'
printf 'SERVER=%s\n' "$SERVER"
printf 'REMOTE_DIR=%s\n' "$REMOTE_DIR"
printf 'NEXT=cd %s && VERSION=%s ARCHIVE=%s ./deploy-docker.sh\n' "$REMOTE_DIR" "$VERSION" "$(basename "$ARTIFACT")"
