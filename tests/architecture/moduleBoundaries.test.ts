// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditModules } from "./moduleAudit.ts";
import { moduleRegistry, type ModuleRegistration } from "./moduleRegistry.ts";
import { readModuleImports } from "./moduleImports.ts";
import { listSourceImports, readInternalModuleImports } from "./sourceGraph.ts";
import { sourceAssets, sourceModules, sourceModulesByRoot } from "./sourceCorpus.ts";
import { sourcePathToRelative } from "./sourceArchitecture.ts";
import { listProductionInventory } from "./productionInventory.ts";
import { auditTextPolicies } from "../support/textPolicy.ts";

const files = listProductionInventory(Object.keys(sourceModulesByRoot));
const imports = listSourceImports().map(edge => ({ ...edge,
  filePath: sourcePathToRelative(edge.filePath),
  targetPath: sourcePathToRelative(edge.targetPath),
}));
for (const [assetPath, content] of Object.entries(sourceAssets)) {
  if (!assetPath.endsWith(".css")) continue;
  const filePath = sourcePathToRelative(assetPath);
  for (const match of content.matchAll(/@import\s+([^;]+);/g)) {
    const literal = /^\s*["']([^"']+)["']\s*$/.exec(match[1]!);
    if (!literal) throw new Error(`Unresolved stylesheet import: ${filePath} ${match[1]}`);
    const importPath = literal[1]!;
    imports.push({ filePath, importPath, targetPath: path.posix.normalize(path.posix.join(path.posix.dirname(filePath), importPath)), targetRoot: "presentation" });
  }
}

const module = (id: string, dependencies: string[] = []): ModuleRegistration => ({
  id, responsibility: id, scope: "tree", publicEntries: [`${id}/index.ts`], dependencies,
});
const edge = (filePath: string, targetPath: string) => ({ filePath, targetPath, importPath: targetPath });

describe("complete production module graph", () => {
  it("accounts for every source and asset on disk with exactly one owner", () => {
    expect([...Object.keys(sourceModules), ...Object.keys(sourceAssets)].map(sourcePathToRelative).sort()).toEqual(files);
    expect(auditModules(files, imports, moduleRegistry)).toEqual([]);
  });

  it("rejects public-path escapes, undeclared dependencies and module cycles even without a file cycle", () => {
    const registry = [module("a", ["b"]), module("b", ["a"])];
    const files = ["a/index.ts", "a/leaf.ts", "b/index.ts", "b/leaf.ts"];
    expect(auditModules(files, [edge("a/leaf.ts", "b/index.ts"), edge("b/leaf.ts", "a/index.ts")], registry))
      .toEqual(["Module cycle: a -> b"]);
    expect(auditModules(files, [edge("a/leaf.ts", "b/leaf.ts")], registry))
      .toContain("a/leaf.ts: internal path escape b/leaf.ts");
    expect(auditModules(files, [edge("a/leaf.ts", "b/index.ts")], [module("a"), module("b")]))
      .toContain("a: undeclared dependency b");
    expect(auditModules(files, [edge("a/index.ts", "a/leaf.ts"), edge("a/leaf.ts", "a/index.ts")], registry))
      .toContain("File cycle: a/index.ts -> a/leaf.ts");
  });

  it("fails closed on omitted files, overlapping ownership, empty scopes and missing entries", () => {
    expect(auditModules([], [], [])).toContain("Production inventory is empty");
    expect(auditModules(["a/index.ts", "unowned.ts"], [], [module("a")]))
      .toContain("unowned.ts: expected one owner, found 0");
    expect(auditModules(["a/index.ts", "a/b/index.ts"], [], [module("a"), module("a/b")]))
      .toContain("a/b/index.ts: expected one owner, found 2");
    expect(auditModules(["a/index.ts"], [], [module("a"), module("b")]))
      .toContain("b: scan scope is empty");
    expect(auditModules(["a/leaf.ts"], [], [module("a")]))
      .toContain("a: missing or foreign public entry a/index.ts");
    const rootOwner = { ...module("tool"), rootFiles: ["launch.sh"] };
    expect(auditModules(["tool/index.ts", "launch.sh"], [], [rootOwner])).toEqual([]);
    expect(auditModules(["tool/index.ts"], [], [rootOwner]))
      .toContain("tool: missing root file launch.sh");
    expect(auditModules(["tool/index.ts", "a/index.ts", "launch.sh"], [], [rootOwner, { ...module("a"), rootFiles: ["launch.sh"] }]))
      .toContain("launch.sh: expected one owner, found 2");
    expect(auditTextPolicies([{ name: "removed scope", corpus: {"a.ts": ""}, scope: /^missing/, pattern: /forbidden/, matches: 0 }]))
      .toEqual(["removed scope: scan scope is empty"]);
  });

  it("checks type imports, re-exports, dynamic imports and rejects unreadable graph inputs", () => {
    const file = "sample.ts";
    expect(readModuleImports({[file]: 'import type { A } from "./a"; export type { B } from "./b"; type C = import("./c").C; const d = import("./d");'}, file))
      .toEqual(["./a", "./b", "./c", "./d"]);
    expect(() => readModuleImports({}, file)).toThrow("missing");
    expect(() => readModuleImports({[file]: "export const x = ;"}, file)).toThrow("Cannot parse");
    expect(() => readModuleImports({[file]: "import(variable)"}, file)).toThrow("literal path");
    expect(() => readInternalModuleImports({[file]: 'export * from "./missing"'}, file)).toThrow("Unresolved import");
  });
});
