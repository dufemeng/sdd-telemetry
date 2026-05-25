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

OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/dist/docker}"
# shellcheck source=./docker-version.sh
source "$ROOT_DIR/scripts/docker-version.sh"

VERSION="${VERSION:-$(read_latest_docker_version "$OUTPUT_DIR" || true)}"
[[ -n "$VERSION" ]] || die "未找到最近打包版本。请先运行 pnpm docker:package，或设置 VERSION=<发布版本>。"
SERVER="${SERVER:-}"
REMOTE_DIR="${REMOTE_DIR:-project/sdd-telemetry-deploy}"
ARTIFACT="${ARTIFACT:-$OUTPUT_DIR/sdd-telemetry-images-${VERSION}.tar.gz}"
CHECKSUM="${CHECKSUM:-${ARTIFACT}.sha256}"
BUNDLE="${BUNDLE:-$OUTPUT_DIR/sdd-telemetry-deploy-bundle-${VERSION}.tar.gz}"

[[ -n "$SERVER" ]] || die "请设置 SERVER=user@host"
[[ -f "$ARTIFACT" ]] || die "镜像包不存在：$ARTIFACT"
[[ -f "$CHECKSUM" ]] || die "校验文件不存在：$CHECKSUM"
if [[ ! -f "$BUNDLE" ]]; then
  VERSION="$VERSION" ARTIFACT="$ARTIFACT" CHECKSUM="$CHECKSUM" BUNDLE="$BUNDLE" \
    "$ROOT_DIR/scripts/bundle-docker-release.sh"
fi

ssh "$SERVER" "mkdir -p '$REMOTE_DIR'"
scp "$BUNDLE" "$SERVER:$REMOTE_DIR/"

printf '\nDone.\n'
printf 'SERVER=%s\n' "$SERVER"
printf 'REMOTE_DIR=%s\n' "$REMOTE_DIR"
printf 'BUNDLE=%s\n' "$BUNDLE"
printf 'NEXT=cd %s && tar -xzf %s && chmod +x deploy-docker.sh && VERSION=%s ARCHIVE=%s ./deploy-docker.sh\n' \
  "$REMOTE_DIR" "$(basename "$BUNDLE")" "$VERSION" "$(basename "$ARTIFACT")"
