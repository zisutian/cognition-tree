// SPDX-License-Identifier: GPL-3.0-or-later

import { createJournalParseIndex } from "../../../core/journal/indexes/journalParseIndex";
import {
  createJournalDiagnostics,
  createJournalDocumentDiagnostics,
  createJournalReferenceDiagnostics,
} from "../../../application/journal/journalDiagnostics";
import { describe, expect, it } from "vitest";
import {
  appendJournalTestEntry,
  createEmptyJournalContent,
  journalEntryId,
  updateJournalTestBody,
} from "../../core/journal/journalTestFixture";

function createDiagnosticContent() {
  let content = appendJournalTestEntry(createEmptyJournalContent(), {
    createdAt: "2026-07-18T00:00:01.100Z",
    entryIndex: 1,
  });
  content = appendJournalTestEntry(content, {
    blockIdStart: 2,
    createdAt: "2026-07-18T00:00:01.900Z",
    entryIndex: 2,
  });
  content = appendJournalTestEntry(content, {
    blockIdStart: 3,
    createdAt: "2026-07-18T00:00:03.000Z",
    entryIndex: 3,
  });
  return updateJournalTestBody(content, {
    body:
      "[未知] 内容\n- [[不存在的日记]]\n- [[知识库:坏:名称]]",
    createBlockIdStart: 10,
    entryIndex: 3,
    updatedAt: "2026-07-18T00:10:00.000Z",
  });
}

describe("journal diagnostics projection", () => {
  it("projects document diagnostics to body-editor lines", () => {
    const index = createJournalParseIndex(createDiagnosticContent());
    const diagnostics = createJournalDocumentDiagnostics(index);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "unknown-marker",
        locationLabel: "2026-07-18-0003 · L1:C1",
        severity: "warning",
        source: "document",
        target: {
          entryId: journalEntryId(3),
          kind: "journal-entry-line",
          lineNumber: 1,
        },
      }),
    ]);
  });

  it("projects unresolved journal and malformed workspace references", () => {
    const index = createJournalParseIndex(createDiagnosticContent());
    const diagnostics = createJournalReferenceDiagnostics(index);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "unresolved-journal-reference",
        locationLabel: "2026-07-18-0003 · L2",
        message: "无法解析日记引用“不存在的日记”。",
        source: "reference",
        target: {
          entryId: journalEntryId(3),
          kind: "journal-entry-line",
          lineNumber: 2,
        },
      }),
      expect.objectContaining({
        code: "invalid-workspace-journal-reference",
        locationLabel: "2026-07-18-0003 · L3",
        source: "reference",
        target: {
          entryId: journalEntryId(3),
          kind: "journal-entry-line",
          lineNumber: 3,
        },
      }),
    ]);
  });

  it("merges, sorts and counts journal-only diagnostics", () => {
    const diagnostics = createJournalDiagnostics(
      createJournalParseIndex(createDiagnosticContent()),
    );

    expect(diagnostics).toMatchObject({
      errorCount: 0,
      status: "ready",
      warningCount: 3,
    });
    expect(diagnostics.diagnostics.map(({ source, target }) => ({
      lineNumber: target.lineNumber,
      source,
    }))).toEqual([
      { lineNumber: 1, source: "document" },
      { lineNumber: 2, source: "reference" },
      { lineNumber: 3, source: "reference" },
    ]);
  });

  it("waits for workspace resolution before projecting qualified faults", () => {
    let content = appendJournalTestEntry(createEmptyJournalContent(), {
      createdAt: "2026-07-18T00:00:00.000Z",
      entryIndex: 1,
    });
    content = updateJournalTestBody(content, {
      body: "- [[知识库:目标笔记]]",
      entryIndex: 1,
      updatedAt: "2026-07-18T00:10:00.000Z",
    });
    const index = createJournalParseIndex(content);

    expect(createJournalDiagnostics(index, { status: "loading" }).diagnostics)
      .toEqual([]);
    expect(createJournalDiagnostics(index, {
      resolutions: [{
        code: "note-not-found",
        message: "找不到目标笔记",
        reference: index.referenceGraph.workspaceReferences[0]!,
        status: "fault",
      }],
      status: "ready",
    }).diagnostics).toEqual([
      expect.objectContaining({
        code: "note-not-found",
        message: "找不到目标笔记",
        source: "workspace-reference",
        target: expect.objectContaining({
          entryId: journalEntryId(1),
          lineNumber: 1,
        }),
      }),
    ]);
  });
});
