// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  analyzeCtnSource,
  defaultCtnSyntax,
  initializeCtnSourceBlockMetadataAnalysis,
  prepareCtnContentEdit,
  prepareExactTextReplacement,
  prepareRawCtnBodyReplacement,
  projectRawCanonicalCtnBody,
  projectCtnContentRange,
  reconcileCtnSourceBlockMetadata,
} from "../../../../../core/ctn/index.ts";
import { createTestBlockId } from "../../../../support/core/ctn/metadata/sourceMetadataFixture.ts";

function fixture(source: string) {
  let id = 0;
  return initializeCtnSourceBlockMetadataAnalysis(source, defaultCtnSyntax, {
    createId: () => createTestBlockId(++id),
    createdAt: "2026-09-09T00:00:00.000Z",
    reservedIds: new Set(),
    updatedAt: "2026-09-09T00:00:00.000Z",
  }).analysis;
}

describe("exact content edits", () => {
  it("edits raw visible text without exposing identities or allowing title changes", () => {
    const analysis = fixture("标题\n- 原文\n- 保留");
    const result = prepareRawCtnBodyReplacement(analysis.sourceText.source, [
      { oldText: "原文", newText: "改动\n追加" },
    ]);
    expect(projectRawCanonicalCtnBody(result.source)).toBe(
      "- 改动\n追加\n- 保留",
    );
    expect(result.source.match(/@ctn-block[^\n]*/g)).toEqual(
      analysis.sourceText.source.match(/@ctn-block[^\n]*/g),
    );
    expect(() =>
      prepareRawCtnBodyReplacement(analysis.sourceText.source, [
        { oldText: "标题", newText: "绕过重命名" },
      ]),
    ).toThrow("does not occur");
    expect(() =>
      prepareRawCtnBodyReplacement(analysis.sourceText.source, [
        { oldText: "原文\n- 保留", newText: "合并" },
      ]),
    ).toThrow("block identities");
    expect(() =>
      prepareRawCtnBodyReplacement(analysis.sourceText.source, [
        { oldText: "原文", newText: "\n@ctn-block fake" },
      ]),
    ).toThrow("Identity metadata");
  });
  it("resolves multiple replacements against the original text", () => {
    const result = prepareExactTextReplacement("甲\n乙\n丙", [
      { oldText: "丙", newText: "甲" },
      { oldText: "甲\n乙", newText: "新的\n内容" },
    ]);
    expect(result.source).toBe("新的\n内容\n甲");
    expect(result.edits).toHaveLength(2);
  });
  it.each([
    ["abc", [{ oldText: "x", newText: "y" }], "does not occur"],
    ["aaa", [{ oldText: "aa", newText: "y" }], "more than once"],
    [
      "abc",
      [
        { oldText: "ab", newText: "x" },
        { oldText: "bc", newText: "y" },
      ],
      "overlap",
    ],
    ["abc", [{ oldText: "", newText: "y" }], "must not be empty"],
  ])(
    "rejects invalid edits without producing partial content",
    (source, replacements, error) => {
      expect(() => prepareExactTextReplacement(source, replacements)).toThrow(
        error,
      );
    },
  );
  it("selects a repeated phrase only within the requested block", () => {
    const analysis = fixture("标题\n- 重复\n\t: 子项\n- 重复");
    const blockId = analysis.document.blocks[1]!.id;
    expect(projectCtnContentRange(analysis, "body", blockId).text).toBe(
      "- 重复",
    );
    expect(projectCtnContentRange(analysis, "body", blockId, true).text).toBe(
      "- 重复\n\t: 子项",
    );
    expect(
      prepareCtnContentEdit(analysis, "body", {
        kind: "replace-text",
        blockId,
        replacements: [{ oldText: "重复", newText: "已改" }],
      }).source,
    ).toBe("- 已改\n\t: 子项\n- 重复");
  });
  it("edits only block text and deletes the complete subtree explicitly", () => {
    const analysis = fixture("标题\n- 父项\n\t: 子项\n- 保留");
    const blockId = analysis.document.blocks[1]!.id;
    expect(
      prepareCtnContentEdit(analysis, "body", {
        kind: "set-block-text",
        blockId,
        text: "更新父项",
      }).source,
    ).toBe("- 更新父项\n\t: 子项\n- 保留");
    expect(
      prepareCtnContentEdit(analysis, "body", {
        kind: "delete-subtree",
        blockId,
      }).source,
    ).toBe("- 保留");
    expect(() =>
      projectCtnContentRange(analysis, "body", analysis.document.blocks[0]!.id),
    ).toThrow("does not exist");
  });
  it("inserts new content with structural indentation without changing existing content", () => {
    const analysis = fixture("标题\n- 父项\n\t: 子项\n- 保留");
    const blockId = analysis.document.blocks[1]!.id;
    expect(
      prepareCtnContentEdit(analysis, "body", {
        kind: "insert-blocks",
        blockId,
        position: "inside",
        text: "- 新项\n\t: 细节",
      }).source,
    ).toBe("- 父项\n\t: 子项\n\t- 新项\n\t\t: 细节\n- 保留");
  });
  it("changes multiline content without replacing its fences or children", () => {
    const analysis = fixture(
      "标题\n- 父项\n\t``` 内容\n\t原文\n\t第二行\n\t```\n- 保留",
    );
    const blockId = analysis.document.blocks[2]!.id;
    expect(
      prepareCtnContentEdit(analysis, "body", {
        kind: "set-block-text",
        blockId,
        text: "新的\n两行",
      }).source,
    ).toBe("- 父项\n\t``` 内容\n\t新的\n\t两行\n\t```\n- 保留");
    expect(() =>
      prepareCtnContentEdit(analysis, "body", {
        kind: "set-block-text",
        blockId,
        text: "```",
      }),
    ).toThrow("closing fence");
  });
  it("preserves repeated blocks' identities and untouched timestamps during reconciliation", () => {
    const previous = fixture("标题\n- 重复\n- 重复");
    const change = prepareCtnContentEdit(previous, "document", {
      kind: "replace-text",
      blockId: previous.document.blocks[2]!.id,
      replacements: [{ oldText: "重复", newText: "改动" }],
    });
    const candidate = analyzeCtnSource({
      mode: { kind: "editable-document" },
      source: change.source,
      syntax: defaultCtnSyntax,
    });
    const updated = reconcileCtnSourceBlockMetadata(
      previous,
      candidate,
      change,
      {
        createId: () => createTestBlockId(100),
        reservedIds: new Set(),
        timestamp: "2026-09-09T01:00:00.000Z",
        touchTitle: true,
      },
    );
    expect(updated.analysis.document.blocks.map(({ id }) => id)).toEqual(
      previous.document.blocks.map(({ id }) => id),
    );
    expect(updated.analysis.document.blocks[1]!.metadata).toEqual(
      previous.document.blocks[1]!.metadata,
    );
    expect(updated.analysis.document.blocks[2]!.metadata.updatedAt).toBe(
      "2026-09-09T01:00:00.000Z",
    );
  });
});
