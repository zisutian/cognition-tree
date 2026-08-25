#!/usr/bin/env bash

set -Eeuo pipefail

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPOSITORY_ROOT"

if [[ "$#" -gt 1 ]]; then
  echo "用法：./start.sh [--development|--production]" >&2
  exit 2
fi

case "${1:---development}" in
  --development)
    readonly SERVICE_SCRIPT="dev"
    readonly SERVICE_MODE="开发"
    ;;
  --production)
    readonly SERVICE_SCRIPT="server:start"
    readonly SERVICE_MODE="生产"
    if [[ ! -f .artifacts/build/client/index.html ||
      ! -f .artifacts/build/server/infrastructure/server/index.js ]]; then
      echo "错误：缺少生产构建，请先运行 pnpm build。" >&2
      exit 1
    fi
    ;;
  *)
    echo "用法：./start.sh [--development|--production]" >&2
    exit 2
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 Node.js，请先安装 Node.js 22.18.0 或更高版本。" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误：未找到 pnpm，请先安装 pnpm 11.1.3。" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "首次运行，正在安装项目依赖……"
  pnpm install --frozen-lockfile
fi

if command -v git >/dev/null 2>&1 &&
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 &&
  [[ "$(git config --get core.hooksPath || true)" != ".githooks" ]]; then
  echo "正在接入项目 Git 提交钩子……"
  pnpm hooks:install
fi

set -m

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

echo "正在以${SERVICE_MODE}模式启动认知树……"
echo "地址以“设置 → 服务”中的当前配置为准。首次启动为 http://127.0.0.1:3001"
echo "按 Ctrl+C 停止认知树。"
echo

while true; do
  pnpm "$SERVICE_SCRIPT" &
  SERVICE_GROUP_ID="$!"
  if wait "$SERVICE_GROUP_ID"; then
    exit_code=0
  else
    exit_code=$?
  fi
  SERVICE_GROUP_ID=""
  if [[ "$exit_code" -eq 0 ]]; then
    echo "服务已停止。"
    exit 0
  fi
  if [[ "$exit_code" -eq 75 ]]; then
    echo "正在应用新的服务设置……"
    continue
  fi
  echo "服务异常退出（状态码：$exit_code）。" >&2
  exit "$exit_code"
done
