#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -Eeuo pipefail
readonly RUNTIME_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$RUNTIME_ROOT/.artifacts/build/server/tooling/cli/ctnCli.js" "$@"
