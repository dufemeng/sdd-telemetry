#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
APP_IMAGE_REPO="${APP_IMAGE_REPO:-sdd-telemetry-app}"
WEB_IMAGE_REPO="${WEB_IMAGE_REPO:-sdd-telemetry-web}"
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8.4}"
INCLUDE_MYSQL="${INCLUDE_MYSQL:-0}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/dist/docker}"
VERSION_INPUT="${VERSION:-}"

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

require_cmd docker
require_cmd git
require_cmd gzip
require_cmd awk

VERSION="$VERSION_INPUT"
if [[ -z "$VERSION" ]]; then
  VERSION="$(git rev-parse --short HEAD 2>/dev/null || true)"
  [[ -n "$VERSION" ]] || VERSION="$(date +%Y%m%d%H%M%S)"

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
      if [[ "${ALLOW_DIRTY:-0}" != "1" ]]; then
        die "当前工作区有未提交改动。先提交，或显式设置 ALLOW_DIRTY=1。"
      fi
      VERSION="${VERSION}-dirty-$(date +%Y%m%d%H%M%S)"
    fi
  fi
fi

[[ "$VERSION" =~ ^[A-Za-z0-9_.-]+$ ]] || die "VERSION 只能包含字母、数字、下划线、点和短横线：$VERSION"

APP_IMAGE="${APP_IMAGE_REPO}:${VERSION}"
WEB_IMAGE="${WEB_IMAGE_REPO}:${VERSION}"
ARTIFACT="${OUTPUT_DIR}/sdd-telemetry-images-${VERSION}.tar.gz"
CHECKSUM="${ARTIFACT}.sha256"

mkdir -p "$OUTPUT_DIR"

printf 'Building %s for %s\n' "$APP_IMAGE" "$DOCKER_PLATFORM"
docker buildx build --platform "$DOCKER_PLATFORM" --target app -t "$APP_IMAGE" --load .

printf 'Building %s for %s\n' "$WEB_IMAGE" "$DOCKER_PLATFORM"
docker buildx build --platform "$DOCKER_PLATFORM" --target web -t "$WEB_IMAGE" --load .

images=("$APP_IMAGE" "$WEB_IMAGE")
if [[ "$INCLUDE_MYSQL" == "1" ]]; then
  printf 'Pulling %s for %s\n' "$MYSQL_IMAGE" "$DOCKER_PLATFORM"
  docker pull --platform "$DOCKER_PLATFORM" "$MYSQL_IMAGE"
  images+=("$MYSQL_IMAGE")
fi

printf 'Saving images to %s\n' "$ARTIFACT"
docker save --platform "$DOCKER_PLATFORM" "${images[@]}" | gzip -c > "$ARTIFACT"

checksum_value="$(sha256_value "$ARTIFACT")"
printf '%s  %s\n' "$checksum_value" "$(basename "$ARTIFACT")" > "$CHECKSUM"

cat > "${OUTPUT_DIR}/deploy-${VERSION}.env" <<EOF
VERSION=${VERSION}
SDD_TELEMETRY_APP_IMAGE=${APP_IMAGE}
SDD_TELEMETRY_WEB_IMAGE=${WEB_IMAGE}
WEB_PUBLISHED_PORT=18080
API_PUBLISHED_PORT=4318
EOF

printf '\nDone.\n'
printf 'VERSION=%s\n' "$VERSION"
printf 'APP_IMAGE=%s\n' "$APP_IMAGE"
printf 'WEB_IMAGE=%s\n' "$WEB_IMAGE"
printf 'ARTIFACT=%s\n' "$ARTIFACT"
printf 'CHECKSUM=%s\n' "$CHECKSUM"
