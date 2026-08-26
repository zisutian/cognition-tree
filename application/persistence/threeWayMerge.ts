// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  PreparedVersionedContent,
  VersionedContentConflictPreference,
} from "./versionedRepository.ts";

const missing = Symbol("missing");

export type ThreeWayContentMergeResult<Content> =
  | { content: Content; status: "merged" }
  | { status: "conflict"; unitIds: string[] };

export function areMergeValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reusePreparedMergeContent<Content, Projection>(
  content: Content,
  candidates: readonly PreparedVersionedContent<Content, Projection>[],
) {
  return candidates.find((candidate) =>
    areMergeValuesEqual(candidate.content, content)
  ) ?? null;
}

export function mergeThreeWayValue<Value>(
  unitId: string,
  base: Value,
  local: Value,
  remote: Value,
  conflictPreference?: VersionedContentConflictPreference,
): { conflict: string | null; value: Value } {
  if (areMergeValuesEqual(local, remote)) {
    return { conflict: null, value: local };
  }
  if (areMergeValuesEqual(local, base)) {
    return { conflict: null, value: remote };
  }
  if (areMergeValuesEqual(remote, base)) {
    return { conflict: null, value: local };
  }
  return {
    conflict: unitId,
    value: conflictPreference === "remote" ? remote : local,
  };
}

function orderedKeys<Value>(...maps: ReadonlyMap<string, Value>[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const map of maps) {
    for (const key of map.keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

export function mergeThreeWayMapValues<Value>(
  unitPrefix: string,
  base: ReadonlyMap<string, Value>,
  local: ReadonlyMap<string, Value>,
  remote: ReadonlyMap<string, Value>,
  conflictPreference?: VersionedContentConflictPreference,
) {
  const values = new Map<string, Value>();
  const conflicts: string[] = [];

  for (const key of orderedKeys(local, remote, base)) {
    const merged = mergeThreeWayValue(
      `${unitPrefix}:${key}`,
      base.get(key) ?? missing,
      local.get(key) ?? missing,
      remote.get(key) ?? missing,
      conflictPreference,
    );

    if (merged.conflict) conflicts.push(merged.conflict);
    if (merged.value !== missing) values.set(key, merged.value as Value);
  }
  return { conflicts, values };
}

export function createThreeWayContentMergeResult<Content>(
  content: Content,
  conflicts: readonly string[],
  conflictPreference?: VersionedContentConflictPreference,
): ThreeWayContentMergeResult<Content> {
  const unitIds = [...new Set(conflicts)].sort();

  return unitIds.length > 0 && !conflictPreference
    ? { status: "conflict", unitIds }
    : { content, status: "merged" };
}

export function crossesSyntaxMergeBarrier({
  baseContent,
  baseSyntax,
  localContent,
  localSyntax,
  remoteContent,
  remoteSyntax,
}: {
  baseContent: unknown;
  baseSyntax: unknown;
  localContent: unknown;
  localSyntax: unknown;
  remoteContent: unknown;
  remoteSyntax: unknown;
}) {
  const localSyntaxChanged = !areMergeValuesEqual(baseSyntax, localSyntax);
  const remoteSyntaxChanged = !areMergeValuesEqual(baseSyntax, remoteSyntax);

  return (
    localSyntaxChanged && !areMergeValuesEqual(baseContent, remoteContent)
  ) || (
    remoteSyntaxChanged && !areMergeValuesEqual(baseContent, localContent)
  );
}
