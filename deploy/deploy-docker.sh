#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_DIR="$(pwd)"
ARTIFACT_DIR="${ARTIFACT_DIR:-$DEPLOY_DIR/releases}"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_DIR/compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
WEB_PUBLISHED_PORT="${WEB_PUBLISHED_PORT:-18080}"
API_PUBLISHED_PORT="${API_PUBLISHED_PORT:-4318}"
RUN_MIGRATE="${RUN_MIGRATE:-1}"
RUN_SEED="${RUN_SEED:-0}"
DOWNLOAD_COMPOSE="${DOWNLOAD_COMPOSE:-auto}"

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

curl_args() {
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    printf '%s\n' -H "Authorization: Bearer ${GITHUB_TOKEN}"
  fi
}

download_file() {
  local url="$1"
  local output="$2"
  local -a args=()

  while IFS= read -r arg; do
    args+=("$arg")
  done < <(curl_args)

  curl -fL --retry 3 --connect-timeout 10 --max-time 1800 "${args[@]}" -o "$output" "$url"
}

verify_checksum() {
  local archive="$1"
  local checksum="$2"
  local archive_dir checksum_name

  [[ -f "$checksum" ]] || return 0
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

  printf 'WARNING: 缺少 sha256sum/shasum，跳过 checksum 校验。\n' >&2
}

infer_version_from_archive() {
  local archive_name="$1"

  if [[ "$archive_name" =~ ^sdd-telemetry-images-(.+)\.tar\.gz$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  fi
}

infer_version_from_bundle() {
  local bundle_name="$1"

  if [[ "$bundle_name" =~ ^sdd-telemetry-deploy-bundle-(.+)\.tar\.gz$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  fi
}

extract_bundle() {
  local bundle="$1"
  local extract_dir

  if [[ -z "$VERSION" ]]; then
    VERSION="$(infer_version_from_bundle "$(basename "$bundle")")"
  fi
  [[ -n "$VERSION" ]] || die "无法从 bundle 识别 VERSION，请显式设置 VERSION=<版本号>。"

  extract_dir="$ARTIFACT_DIR/bundle-${VERSION}"
  mkdir -p "$extract_dir"
  tar -xzf "$bundle" -C "$extract_dir"

  ARCHIVE="$extract_dir/sdd-telemetry-images-${VERSION}.tar.gz"
  CHECKSUM="${ARCHIVE}.sha256"
  [[ -f "$ARCHIVE" ]] || die "bundle 中缺少镜像包：$(basename "$ARCHIVE")"
  [[ -f "$CHECKSUM" ]] || die "bundle 中缺少镜像校验文件：$(basename "$CHECKSUM")"

  if [[ "$DOWNLOAD_COMPOSE" == "auto" || "$DOWNLOAD_COMPOSE" == "1" ]]; then
    [[ -f "$extract_dir/compose.prod.yml" ]] || die "bundle 中缺少 compose.prod.yml"
    cp "$extract_dir/compose.prod.yml" "$COMPOSE_FILE"
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp

  tmp="$(mktemp)"
  touch "$ENV_FILE"
  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (replaced == 0) {
        print key "=" value
      }
    }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

require_cmd awk
require_cmd curl
require_cmd docker
require_cmd gzip
require_cmd tar

if ! docker compose version >/dev/null 2>&1; then
  die "当前 Docker 不支持 docker compose v2。"
fi

VERSION="${VERSION:-}"
ARCHIVE="${ARCHIVE:-}"
CHECKSUM="${CHECKSUM:-}"
BUNDLE="${BUNDLE:-}"

if [[ -n "$BUNDLE" ]]; then
  [[ -f "$BUNDLE" ]] || die "部署 bundle 不存在：$BUNDLE"
  BUNDLE="$(cd "$(dirname "$BUNDLE")" && pwd)/$(basename "$BUNDLE")"
  extract_bundle "$BUNDLE"
elif [[ -n "$ARCHIVE" ]]; then
  [[ -f "$ARCHIVE" ]] || die "镜像包不存在：$ARCHIVE"
  ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"
  CHECKSUM="${CHECKSUM:-${ARCHIVE}.sha256}"

  if [[ -z "$VERSION" ]]; then
    VERSION="$(infer_version_from_archive "$(basename "$ARCHIVE")")"
  fi
else
  REPO="${REPO:-${GITHUB_REPOSITORY:-$(detect_repo)}}"
  [[ -n "$REPO" ]] || die "请设置 REPO=owner/repo，或设置 ARCHIVE=/path/to/sdd-telemetry-images-<version>.tar.gz。"
  [[ -n "$VERSION" ]] || die "请设置 VERSION=<发布版本>。"

  TAG="${TAG:-deploy-${VERSION}}"
  BUNDLE_NAME="${BUNDLE_NAME:-sdd-telemetry-deploy-bundle-${VERSION}.tar.gz}"
  ASSET_NAME="${ASSET_NAME:-sdd-telemetry-images-${VERSION}.tar.gz}"
  RELEASE_BASE_URL="${RELEASE_BASE_URL:-https://github.com/${REPO}/releases/download/${TAG}}"

  mkdir -p "$ARTIFACT_DIR"
  BUNDLE="$ARTIFACT_DIR/$BUNDLE_NAME"

  printf 'Downloading %s\n' "$RELEASE_BASE_URL/$BUNDLE_NAME"
  if download_file "$RELEASE_BASE_URL/$BUNDLE_NAME" "$BUNDLE"; then
    extract_bundle "$BUNDLE"
  else
    printf 'Bundle unavailable; falling back to legacy release assets.\n'
    ARCHIVE="$ARTIFACT_DIR/$ASSET_NAME"
    CHECKSUM="${CHECKSUM:-${ARCHIVE}.sha256}"

    printf 'Downloading %s\n' "$RELEASE_BASE_URL/$ASSET_NAME"
    download_file "$RELEASE_BASE_URL/$ASSET_NAME" "$ARCHIVE"

    if download_file "$RELEASE_BASE_URL/${ASSET_NAME}.sha256" "$CHECKSUM"; then
      printf 'Downloaded checksum %s\n' "$CHECKSUM"
    else
      rm -f "$CHECKSUM"
      printf 'WARNING: 未下载到 checksum，继续部署。\n' >&2
    fi

    if [[ "$DOWNLOAD_COMPOSE" == "auto" || "$DOWNLOAD_COMPOSE" == "1" ]]; then
      printf 'Downloading compose.prod.yml\n'
      download_file "$RELEASE_BASE_URL/compose.prod.yml" "$COMPOSE_FILE"
    fi
  fi
fi

[[ -n "$VERSION" ]] || die "无法识别 VERSION，请显式设置 VERSION=<版本号>。"
[[ -f "$COMPOSE_FILE" ]] || die "compose 文件不存在：$COMPOSE_FILE"

SDD_TELEMETRY_APP_IMAGE="${SDD_TELEMETRY_APP_IMAGE:-sdd-telemetry-app:${VERSION}}"
SDD_TELEMETRY_WEB_IMAGE="${SDD_TELEMETRY_WEB_IMAGE:-sdd-telemetry-web:${VERSION}}"

verify_checksum "$ARCHIVE" "$CHECKSUM"

printf 'Loading Docker images from %s\n' "$ARCHIVE"
gzip -dc "$ARCHIVE" | docker load

set_env_value SDD_TELEMETRY_APP_IMAGE "$SDD_TELEMETRY_APP_IMAGE"
set_env_value SDD_TELEMETRY_WEB_IMAGE "$SDD_TELEMETRY_WEB_IMAGE"
set_env_value WEB_PUBLISHED_PORT "$WEB_PUBLISHED_PORT"
set_env_value API_PUBLISHED_PORT "$API_PUBLISHED_PORT"
set_env_value DEPLOY_VERSION "$VERSION"
if [[ -n "${MYSQL_PUBLISHED_PORT:-}" ]]; then
  set_env_value MYSQL_PUBLISHED_PORT "$MYSQL_PUBLISHED_PORT"
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

printf 'Starting mysql\n'
"${compose[@]}" up -d mysql

if [[ "$RUN_MIGRATE" == "1" ]]; then
  printf 'Running migrations\n'
  "${compose[@]}" --profile setup run --rm migrate
fi

if [[ "$RUN_SEED" == "1" ]]; then
  printf 'Running seed\n'
  "${compose[@]}" --profile setup run --rm seed
fi

printf 'Starting application services\n'
"${compose[@]}" up -d server worker web
"${compose[@]}" ps

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${API_PUBLISHED_PORT}/api/ingest/health}"
printf 'Checking health: %s\n' "$HEALTH_URL"
for _ in {1..30}; do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    printf 'Deployment is healthy.\n'
    printf 'Web: http://127.0.0.1:%s\n' "$WEB_PUBLISHED_PORT"
    exit 0
  fi
  sleep 2
done

die "健康检查失败：$HEALTH_URL"
