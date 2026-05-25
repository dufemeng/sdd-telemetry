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

require_cmd curl
require_cmd git
require_cmd scp
require_cmd ssh
require_cmd tar

VERSION="${VERSION:-${1:-}}"
[[ -n "$VERSION" ]] || die "请设置 VERSION=<发布版本>，例如 VERSION=20260525-185012-cst pnpm docker:relay。"

REPO="${REPO:-${GITHUB_REPOSITORY:-$(detect_repo)}}"
[[ -n "$REPO" ]] || die "无法识别 GitHub 仓库。请设置 REPO=owner/repo。"

SERVER="${SERVER:-}"
[[ -n "$SERVER" ]] || die "请设置 SERVER=user@host，或写入 $CONFIG_FILE。"

REMOTE_DIR="${REMOTE_DIR:-project/sdd-telemetry-deploy}"
TAG="${TAG:-deploy-${VERSION}}"
RELEASE_BASE_URL="${RELEASE_BASE_URL:-https://github.com/${REPO}/releases/download/${TAG}}"
DOWNLOAD_DIR="${DOWNLOAD_DIR:-$ROOT_DIR/dist/docker/relay-${VERSION}}"
BUNDLE_NAME="${BUNDLE_NAME:-sdd-telemetry-deploy-bundle-${VERSION}.tar.gz}"
BUNDLE="$DOWNLOAD_DIR/$BUNDLE_NAME"

mkdir -p "$DOWNLOAD_DIR"

printf 'Downloading release %s from %s\n' "$TAG" "$REPO"
download_file "$RELEASE_BASE_URL/$BUNDLE_NAME" "$BUNDLE"
tar -tzf "$BUNDLE" >/dev/null

printf 'Uploading release assets to %s:%s\n' "$SERVER" "$REMOTE_DIR"
ssh "$SERVER" "mkdir -p '$REMOTE_DIR'"
scp "$BUNDLE" "$SERVER:$REMOTE_DIR/"

printf '\nRelease assets relayed.\n'
printf 'SERVER=%s\n' "$SERVER"
printf 'REMOTE_DIR=%s\n' "$REMOTE_DIR"
printf 'BUNDLE=%s\n' "$BUNDLE"
printf 'NEXT=ssh %s \"cd %s && tar -xzf %s && chmod +x deploy-docker.sh && VERSION=%s ARCHIVE=sdd-telemetry-images-%s.tar.gz ./deploy-docker.sh\"\n' \
  "$SERVER" "$REMOTE_DIR" "$BUNDLE_NAME" "$VERSION" "$VERSION"
