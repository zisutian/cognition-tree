// SPDX-License-Identifier: GPL-3.0-or-later

import type { ModuleRegistration } from "./moduleRegistry.ts";
import { findDependencyCycles } from "./sourceGraph.ts";
import type { InternalModuleImport } from "./sourceArchitecture.ts";

export function auditModules(
  files: readonly string[],
  imports: readonly InternalModuleImport[],
  registry: readonly ModuleRegistration[],
) {
  const violations: string[] = [];
  if (files.length === 0) return ["Production inventory is empty"];
  const knownFiles = new Set(files);
  const registrations = new Map(registry.map(module => [module.id, module]));
  if (registrations.size !== registry.length) violations.push("Duplicate module registration");
  if (knownFiles.size !== files.length) violations.push("Duplicate production file");
  const owners = new Map<string, ModuleRegistration>();
  for (const file of files) {
    const candidates = registry.filter(module => {
      if (module.rootFiles?.includes(file)) return true;
      if (!file.startsWith(`${module.id}/`)) return false;
      return module.scope === "tree" || !file.slice(module.id.length + 1).includes("/");
    });
    if (candidates.length !== 1) violations.push(`${file}: expected one owner, found ${candidates.length}`);
    else owners.set(file, candidates[0]!);
  }
  const graph = new Map(registry.map(module => [module.id, new Set<string>()]));
  for (const module of registry) {
    if (!module.responsibility.trim()) violations.push(`${module.id}: responsibility is empty`);
    if (![...owners.values()].includes(module)) violations.push(`${module.id}: scan scope is empty`);
    for (const file of module.rootFiles ?? []) {
      if (!knownFiles.has(file)) violations.push(`${module.id}: missing root file ${file}`);
    }
    for (const entry of module.publicEntries) {
      if (!knownFiles.has(entry) || owners.get(entry) !== module) violations.push(`${module.id}: missing or foreign public entry ${entry}`);
    }
    for (const dependency of module.dependencies) {
      if (dependency === module.id || !registrations.has(dependency)) violations.push(`${module.id}: invalid dependency ${dependency}`);
    }
  }
  const fileGraph = new Map(files.map(file => [file, new Set<string>()]));
  for (const edge of imports) {
    const from = owners.get(edge.filePath), to = owners.get(edge.targetPath);
    if (!from || !to) {
      violations.push(`Import is outside registered inventory: ${edge.filePath} -> ${edge.targetPath}`);
      continue;
    }
    fileGraph.get(edge.filePath)!.add(edge.targetPath);
    if (from === to) continue;
    graph.get(from.id)!.add(to.id);
    if (!from.dependencies.includes(to.id)) violations.push(`${from.id}: undeclared dependency ${to.id}`);
    if (!to.publicEntries.includes(edge.targetPath)) violations.push(`${edge.filePath}: internal path escape ${edge.targetPath}`);
  }
  const cycles = (input: Map<string, Set<string>>) => findDependencyCycles(new Map(
    [...input].map(([id, targets]) => [id, [...targets]]),
  ));
  for (const cycle of cycles(graph)) violations.push(`Module cycle: ${cycle.join(" -> ")}`);
  for (const cycle of cycles(fileGraph)) violations.push(`File cycle: ${cycle.join(" -> ")}`);
  return violations;
}
