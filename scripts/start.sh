#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "Starting Cognition Tree desktop app..."
echo "Repository root: $repo_root"
echo "Default note repository: ${XDG_DATA_HOME:-$HOME/.local/share}/dev.zisutian.cognition-tree/repositories/local-workspace"

pnpm tauri dev
