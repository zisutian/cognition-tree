#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -Eeuo pipefail
set -m
if [[ -d "../.$(basename -- "$PWD").release-lock" ]]; then
  echo "运行目录正在更新或等待更新恢复，请先完成维护。" >&2
  exit 1
fi

SERVICE_GROUP_ID=""
cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "$SERVICE_GROUP_ID" ]]; then
    kill -TERM -- "-$SERVICE_GROUP_ID" 2>/dev/null || true
    wait "$SERVICE_GROUP_ID" 2>/dev/null || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "按 Ctrl+C 停止认知树。"
while true; do
  "$@" &
  SERVICE_GROUP_ID="$!"
  if wait "$SERVICE_GROUP_ID"; then exit_code=0; else exit_code=$?; fi
  SERVICE_GROUP_ID=""
  case "$exit_code" in
    0) echo "服务已停止。"; exit 0 ;;
    75) echo "正在应用新的服务设置……" ;;
    *) echo "服务异常退出（状态码：$exit_code）。" >&2; exit "$exit_code" ;;
  esac
done
