// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, it } from "vitest";
import { equalCtnSourceExceptModificationTime, mergeCtnSourceModificationTimes } from "../../../../core/ctn/metadata/sourceMergeMetadata.ts";
import { analyzeCanonicalTestSource } from "../analysis/analysisTestHelpers.ts";
import { addTestCtnBlockMetadata, testBlockTimestamp } from "./sourceMetadataFixture.ts";

it("ignores only parsed modification times and preserves identities and literal content", () => {
  const source = addTestCtnBlockMetadata("Title\n: body");
  const base = analyzeCanonicalTestSource(source);
  const updated = analyzeCanonicalTestSource(source.split(`updated=${testBlockTimestamp}`).join("updated=2026-09-06T00:00:00.000Z"));
  expect(equalCtnSourceExceptModificationTime(base, updated)).toBe(true);
  expect(mergeCtnSourceModificationTimes(base, [updated])).toBe(updated.sourceText.source);
  expect(mergeCtnSourceModificationTimes(updated, [base])).toBe(updated.sourceText.source);
  const differentText = analyzeCanonicalTestSource(source.replace(": body", ": different"));
  expect(equalCtnSourceExceptModificationTime(base, differentText)).toBe(false);
  const differentIdentity = analyzeCanonicalTestSource(source.replace(
    "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-999999999999",
  ));
  expect(equalCtnSourceExceptModificationTime(base, differentIdentity)).toBe(false);
  const foreign = analyzeCanonicalTestSource(updated.sourceText.source.split(`created=${testBlockTimestamp}`).join("created=2026-08-01T00:00:00.000Z"));
  expect(equalCtnSourceExceptModificationTime(base, foreign)).toBe(false);
  expect(mergeCtnSourceModificationTimes(base, [foreign])).toBe(source);
});
