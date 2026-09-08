#!/usr/bin/env bash

set -Eeuo pipefail

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPOSITORY_ROOT"

if [[ "$#" -ne 0 ]]; then
  echo "用法：./start.sh（开发环境，不接受参数）" >&2
  exit 2
fi

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

node tooling/runtime/prepareDevelopment.ts
echo "正在启动认知树开发环境……"
exec bash tooling/runtime/supervise.sh node infrastructure/server/index.ts --development
