import { analyzeCtnSource } from "../../../../core/ctn/analysis/sourceAnalysis";
import { initializeCtnSourceBlockMetadata } from "../../../../core/ctn/metadata/sourceMetadata";
import { defaultCtnSyntax } from "../../../../core/ctn/syntax/defaultSyntax";
import type { CtnCompiledSyntax } from "../../../../core/ctn/syntax/types";

export const testBlockTimestamp = "2026-07-15T00:00:00.000Z";

export function createTestBlockId(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

export function addTestCtnBlockMetadata(
  source: string,
  syntax: CtnCompiledSyntax = defaultCtnSyntax,
  idOffset = 0,
) {
  let index = idOffset;

  return initializeCtnSourceBlockMetadata(source, syntax, {
    createdAt: testBlockTimestamp,
    createId: () => createTestBlockId(++index),
    reservedIds: new Set(),
    updatedAt: testBlockTimestamp,
  });
}

export function stripTestCtnBlockMetadata(source: string) {
  return analyzeCtnSource({
    mode: { kind: "canonical-document" },
    source,
    syntax: defaultCtnSyntax,
  }).editableProjection.source;
}
