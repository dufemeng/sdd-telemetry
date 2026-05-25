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
require_cmd docker
require_cmd gh

# shellcheck source=./docker-version.sh
source "$ROOT_DIR/scripts/docker-version.sh"

if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
  die "发布前已跟踪文件必须无未提交改动。请先提交当前变更。"
fi

VERSION="${VERSION:-$(new_docker_version)}"
TAG="${TAG:-deploy-${VERSION}}"

printf 'Packaging Docker images for version %s\n' "$VERSION"
VERSION="$VERSION" "$ROOT_DIR/scripts/package-docker.sh"

printf 'Publishing GitHub Release %s\n' "$TAG"
VERSION="$VERSION" TAG="$TAG" REPO="${REPO:-}" "$ROOT_DIR/scripts/upload-release.sh"

printf '\nRelease published.\n'
printf 'VERSION=%s\n' "$VERSION"
printf 'TAG=%s\n' "$TAG"
printf 'NEXT_ON_RELAY_MACHINE=VERSION=%s pnpm docker:relay\n' "$VERSION"
