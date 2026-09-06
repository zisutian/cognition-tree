// SPDX-License-Identifier: GPL-3.0-or-later

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function listProductionInventory(roots: readonly string[]) {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  function walk(directory: string): string[] {
    return readdirSync(path.join(projectRoot, directory), { withFileTypes: true })
      .flatMap(entry => {
        const relativePath = `${directory}/${entry.name}`;
        if (entry.isSymbolicLink()) throw new Error(`Untracked ownership through symlink: ${relativePath}`);
        if (entry.isDirectory()) return walk(relativePath);
        if (!entry.isFile()) throw new Error(`Unsupported production entry: ${relativePath}`);
        return [relativePath];
      });
  }
  const excluded = new Set([
    "node_modules", ".git", ".artifacts", ".cognition-tree", "docs", "tests", "e2e",
    "README.md", "LICENSE", ".gitignore", ".gitattributes",
  ]);
  const entries = readdirSync(projectRoot, { withFileTypes: true });
  for (const root of roots) {
    if (!entries.some(entry => entry.name === root && entry.isDirectory())) throw new Error(`Missing source root: ${root}`);
  }
  return entries.filter(entry => !excluded.has(entry.name)).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Untracked ownership through symlink: ${entry.name}`);
    return entry.isDirectory() ? walk(entry.name) : [entry.name];
  }).sort();
}
