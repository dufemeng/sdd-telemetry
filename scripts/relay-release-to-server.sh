#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CONFIG_FILE="${SDD_RELAY_CONFIG_FILE:-$HOME/.config/sdd-telemetry/relay.env}"
if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
fi

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

detect_repo() {
  local remote repo

  remote="$(git config --get remote.origin.url 2>/dev/null || true)"
  case "$remote" in
    git@github.com:*)
      repo="${remote#git@github.com:}"
      printf '%s\n' "${repo%.git}"
      ;;
    https://github.com/*)
      repo="${remote#https://github.com/}"
      printf '%s\n' "${repo%.git}"
      ;;
    *)
      return 0
      ;;
  esac
}

download_file() {
  local url="$1"
  local output="$2"
  local -a args=()

  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    args+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
  fi

  curl -fL --retry 3 --connect-timeout 10 --max-time 1800 "${args[@]}" -o "$output" "$url"
}

verify_checksum() {
  local archive="$1"
  local checksum="$2"
  local archive_dir checksum_name

  archive_dir="$(cd "$(dirname "$archive")" && pwd)"
  checksum_name="$(basename "$checksum")"

  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$archive_dir" && sha256sum -c "$checksum_name")
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    (cd "$archive_dir" && shasum -a 256 -c "$checksum_name")
    return
  fi

  die "缺少 sha256sum/shasum，无法在转发前校验镜像包。"
}

require_cmd curl
require_cmd git
require_cmd scp
require_cmd ssh

VERSION="${VERSION:-${1:-}}"
[[ -n "$VERSION" ]] || die "请设置 VERSION=<版本号>，例如 VERSION=341d59e pnpm docker:relay。"

REPO="${REPO:-${GITHUB_REPOSITORY:-$(detect_repo)}}"
[[ -n "$REPO" ]] || die "无法识别 GitHub 仓库。请设置 REPO=owner/repo。"

SERVER="${SERVER:-}"
[[ -n "$SERVER" ]] || die "请设置 SERVER=user@host，或写入 $CONFIG_FILE。"

REMOTE_DIR="${REMOTE_DIR:-project/sdd-telemetry-deploy}"
TAG="${TAG:-deploy-${VERSION}}"
RELEASE_BASE_URL="${RELEASE_BASE_URL:-https://github.com/${REPO}/releases/download/${TAG}}"
DOWNLOAD_DIR="${DOWNLOAD_DIR:-$ROOT_DIR/dist/docker/relay-${VERSION}}"
ASSET_NAME="${ASSET_NAME:-sdd-telemetry-images-${VERSION}.tar.gz}"
ARTIFACT="$DOWNLOAD_DIR/$ASSET_NAME"
CHECKSUM="${ARTIFACT}.sha256"
COMPOSE_FILE="$DOWNLOAD_DIR/compose.prod.yml"
DEPLOY_SCRIPT="$DOWNLOAD_DIR/deploy-docker.sh"

mkdir -p "$DOWNLOAD_DIR"

printf 'Downloading release %s from %s\n' "$TAG" "$REPO"
download_file "$RELEASE_BASE_URL/$ASSET_NAME" "$ARTIFACT"
download_file "$RELEASE_BASE_URL/${ASSET_NAME}.sha256" "$CHECKSUM"
download_file "$RELEASE_BASE_URL/compose.prod.yml" "$COMPOSE_FILE"
download_file "$RELEASE_BASE_URL/deploy-docker.sh" "$DEPLOY_SCRIPT"

verify_checksum "$ARTIFACT" "$CHECKSUM"

printf 'Uploading release assets to %s:%s\n' "$SERVER" "$REMOTE_DIR"
ssh "$SERVER" "mkdir -p '$REMOTE_DIR'"
scp "$ARTIFACT" "$CHECKSUM" "$COMPOSE_FILE" "$DEPLOY_SCRIPT" "$SERVER:$REMOTE_DIR/"
ssh "$SERVER" "chmod +x '$REMOTE_DIR/deploy-docker.sh'"

printf '\nRelease assets relayed.\n'
printf 'SERVER=%s\n' "$SERVER"
printf 'REMOTE_DIR=%s\n' "$REMOTE_DIR"
printf 'NEXT=ssh %s \"cd %s && VERSION=%s ARCHIVE=%s ./deploy-docker.sh\"\n' \
  "$SERVER" "$REMOTE_DIR" "$VERSION" "$ASSET_NAME"
