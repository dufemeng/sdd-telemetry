#!/usr/bin/env bash

new_docker_version() {
  TZ=Asia/Shanghai date '+%Y%m%d-%H%M%S-cst'
}

read_latest_docker_version() {
  local output_dir="$1"
  local version_file="$output_dir/latest-version"

  [[ -f "$version_file" ]] || return 1
  tr -d '[:space:]' < "$version_file"
}

write_latest_docker_version() {
  local output_dir="$1"
  local version="$2"

  mkdir -p "$output_dir"
  printf '%s\n' "$version" > "$output_dir/latest-version"
}
