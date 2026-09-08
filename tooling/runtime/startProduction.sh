#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -Eeuo pipefail
readonly RUNTIME_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$RUNTIME_ROOT"
if [[ "$#" -ne 0 ]]; then
  echo "用法：./start.sh（可用版，不接受参数）" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "错误：需要 Node.js 22.18.0 或更高版本。" >&2
  exit 1
fi
if [[ ! -f release.json || ! -f .artifacts/build/client/index.html ||
      ! -f .artifacts/build/server/infrastructure/server/index.js ]]; then
  echo "错误：运行包不完整，请从开发仓库重新发布。" >&2
  exit 1
fi
echo "正在启动认知树可用版……"
exec bash runtime/supervise.sh node .artifacts/build/server/infrastructure/server/index.js
