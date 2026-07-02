import { describe, expect, it } from "vitest";
import { createInitialWorkspace, createNoteRecord } from "../../src/domain/notes";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../src/syntax/types";
import { resolveParsedNoteView } from "../../src/workspace/parsedNoteView";

const timestamp = "2026-06-08T00:00:00.000Z";

describe("resolveParsedNoteView", () => {
  it("parses notes with the workspace syntax profile", () => {
    const note = createNoteRecord(
      "note-first",
      "概念\n    : 定义",
      timestamp,
    );
    const workspace = {
      ...createInitialWorkspace(defaultCtnSyntaxProfile),
      notes: [note],
      activeNoteId: note.id,
    };
    const result = resolveParsedNoteView(workspace, note);

    expect(result.status).toBe("parsed");
    expect(result.document.blocks.map((block) => block.label)).toEqual([
      "概念",
      "定义",
    ]);
  });

  it("parses an empty document with the workspace syntax without an active note", () => {
    const result = resolveParsedNoteView(
      createInitialWorkspace(defaultCtnSyntaxProfile),
      null,
    );

    expect(result).toMatchObject({
      document: { blocks: [], diagnostics: [], roots: [] },
      source: "",
      status: "parsed",
    });
  });

  it("reports invalid workspace profile shape", () => {
    const invalidProfile = {
      ...defaultCtnSyntaxProfile,
      inlineRules: undefined,
    } as unknown as CtnSyntaxProfile;
    const note = createNoteRecord("note-first", "概念", timestamp);
    const workspace = {
      ...createInitialWorkspace(invalidProfile),
      notes: [note],
    };

    expect(resolveParsedNoteView(workspace, note)).toMatchObject({
      status: "invalid-profile",
    });
  });
});
