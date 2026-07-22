import { createCtnEditableSource } from "../../../core/ctn/metadata/editableSource";
import { initializeCtnSourceBlockMetadata } from "../../../core/ctn/metadata/sourceMetadata";
import { defaultCtnSyntaxProfile } from "../../../core/ctn/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../../core/ctn/syntax/types";

export const testBlockTimestamp = "2026-07-15T00:00:00.000Z";

export function createTestBlockId(value: number) {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

export function addTestCtnBlockMetadata(
  source: string,
  syntaxProfile: CtnSyntaxProfile = defaultCtnSyntaxProfile,
  idOffset = 0,
) {
  let index = idOffset;

  return initializeCtnSourceBlockMetadata(source, syntaxProfile, {
    createdAt: testBlockTimestamp,
    createId: () => createTestBlockId(++index),
    reservedIds: new Set(),
    updatedAt: testBlockTimestamp,
  });
}

export function stripTestCtnBlockMetadata(source: string) {
  return createCtnEditableSource(source, defaultCtnSyntaxProfile).source;
}
