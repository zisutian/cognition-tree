import type { CSSProperties } from "react";

export const defaultStructureTreeIndentUnitCount = 4;
export const defaultStructureTreeIndentWidthPx = 14;

export function normalizeStructureTreeIndentUnitCount(
  indentUnitCount = defaultStructureTreeIndentUnitCount,
) {
  const normalizedIndentUnitCount = Math.floor(indentUnitCount);

  return Number.isFinite(normalizedIndentUnitCount) &&
    normalizedIndentUnitCount > 0
    ? normalizedIndentUnitCount
    : defaultStructureTreeIndentUnitCount;
}

export function getStructureTreeIndentWidthPx(indentUnitCount?: number) {
  return (
    (normalizeStructureTreeIndentUnitCount(indentUnitCount) /
      defaultStructureTreeIndentUnitCount) *
    defaultStructureTreeIndentWidthPx
  );
}

export function getStructureTreeRowStyle({
  depth,
  indentUnitCount,
}: {
  depth: number;
  indentUnitCount?: number;
}) {
  return {
    "--ui-structure-depth": String(depth),
    "--ui-structure-indent-width": `${getStructureTreeIndentWidthPx(
      indentUnitCount,
    )}px`,
  } as CSSProperties;
}
