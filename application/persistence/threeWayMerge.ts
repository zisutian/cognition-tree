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
  const pending: Array<readonly [unknown, unknown]> = [[left, right]];
  const compared = new WeakMap<object, WeakSet<object>>();

  while (pending.length > 0) {
    const [leftValue, rightValue] = pending.pop()!;

    if (
      leftValue === rightValue ||
      (typeof leftValue === "number" &&
        typeof rightValue === "number" &&
        Number.isNaN(leftValue) && Number.isNaN(rightValue))
    ) {
      continue;
    }
    if (
      leftValue === null || rightValue === null ||
      typeof leftValue !== "object" || typeof rightValue !== "object"
    ) {
      return false;
    }
    const leftIsArray = Array.isArray(leftValue);

    if (leftIsArray !== Array.isArray(rightValue)) return false;
    let comparedWithLeft = compared.get(leftValue);

    if (comparedWithLeft?.has(rightValue)) continue;
    if (!comparedWithLeft) {
      comparedWithLeft = new WeakSet<object>();
      compared.set(leftValue, comparedWithLeft);
    }
    comparedWithLeft.add(rightValue);
    if (leftIsArray) {
      const leftArray = leftValue as unknown[];
      const rightArray = rightValue as unknown[];

      if (leftArray.length !== rightArray.length) return false;
      for (let index = 0; index < leftArray.length; index += 1) {
        pending.push([leftArray[index], rightArray[index]]);
      }
      continue;
    }
    const leftRecord = leftValue as Record<string, unknown>;
    const rightRecord = rightValue as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);

    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) return false;
      pending.push([leftRecord[key], rightRecord[key]]);
    }
  }
  return true;
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
  equal: (left: Value, right: Value) => boolean = areMergeValuesEqual,
): { conflict: string | null; resolvedConflict?: string; value: Value } {
  if (equal(local, remote)) {
    return { conflict: null, value: local };
  }
  if (equal(local, base)) {
    return { conflict: null, value: remote };
  }
  if (equal(remote, base)) {
    return { conflict: null, value: local };
  }
  return {
    conflict: conflictPreference ? null : unitId,
    ...(conflictPreference ? { resolvedConflict: unitId } : {}),
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
  equal: (left: Value, right: Value) => boolean = areMergeValuesEqual,
) {
  const values = new Map<string, Value>();
  const conflicts: string[] = [];
  const resolvedConflicts: string[] = [];

  for (const key of orderedKeys(local, remote, base)) {
    const merged = mergeThreeWayValue(
      `${unitPrefix}:${key}`,
      base.get(key) ?? missing,
      local.get(key) ?? missing,
      remote.get(key) ?? missing,
      conflictPreference,
      (left, right) => left === missing || right === missing ? left === right : equal(left, right),
    );

    if (merged.conflict) conflicts.push(merged.conflict);
    if (merged.resolvedConflict) resolvedConflicts.push(merged.resolvedConflict);
    if (merged.value !== missing) values.set(key, merged.value as Value);
  }
  return { conflicts, resolvedConflicts, values };
}

export function createThreeWayContentMergeResult<Content>(
  content: Content,
  conflicts: readonly string[],
): ThreeWayContentMergeResult<Content> {
  const unitIds = [...new Set(conflicts)].sort();

  return unitIds.length > 0
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
