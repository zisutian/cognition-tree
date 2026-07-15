import { ctnBlockMetadataDirective } from "../../../src/ctn/metadata/blockMetadata";
import { initializeCtnSourceBlockMetadata } from "../../../src/ctn/metadata/sourceMetadata";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../../src/ctn/syntax/types";

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
    updatedAt: testBlockTimestamp,
  });
}

export function stripTestCtnBlockMetadata(source: string) {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(ctnBlockMetadataDirective))
    .join("\n");
}
