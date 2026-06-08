import { describe, expect, it } from "vitest";
import { createInitialWorkspace, createNoteRecord } from "../../src/domain/notes";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../src/syntax/types";
import { resolveParsedNote } from "../../src/workspace/parsedNote";

const timestamp = "2026-06-08T00:00:00.000Z";

describe("resolveParsedNote", () => {
  it("parses notes with their selected syntax profile", () => {
    const note = createNoteRecord(
      "note-first",
      "概念\n    : 定义",
      timestamp,
      defaultCtnSyntaxProfile,
    );
    const workspace = {
      ...createInitialWorkspace([defaultCtnSyntaxProfile]),
      notes: [note],
      activeNoteId: note.id,
    };
    const result = resolveParsedNote(workspace, note);

    expect(result.status).toBe("parsed");
    expect(result.document.blocks.map((block) => block.label)).toEqual([
      "概念",
      "定义",
    ]);
  });

  it("parses an empty document with the workspace default syntax without an active note", () => {
    const result = resolveParsedNote(
      createInitialWorkspace([defaultCtnSyntaxProfile]),
      null,
    );

    expect(result).toMatchObject({
      document: { blocks: [], diagnostics: [], roots: [] },
      source: "",
      status: "parsed",
    });
  });

  it("reports missing note syntax profiles", () => {
    const note = {
      ...createNoteRecord("note-first", "概念", timestamp, defaultCtnSyntaxProfile),
      syntaxProfileId: "missing",
      syntaxVersion: 99,
    };
    const workspace = {
      ...createInitialWorkspace(),
      defaultSyntaxProfileId: defaultCtnSyntaxProfile.id,
      notes: [note],
      syntaxProfiles: [defaultCtnSyntaxProfile],
    };

    expect(resolveParsedNote(workspace, note)).toMatchObject({
      message: "笔记引用的语法 missing@99 不存在。",
      status: "missing-profile",
    });
  });

  it("reports invalid profile shape separately from missing profiles", () => {
    const invalidProfile = {
      ...defaultCtnSyntaxProfile,
      inlineRules: undefined,
    } as unknown as CtnSyntaxProfile;
    const note = createNoteRecord("note-first", "概念", timestamp, invalidProfile);
    const workspace = {
      ...createInitialWorkspace([invalidProfile]),
      notes: [note],
      syntaxProfiles: [invalidProfile],
    };

    expect(resolveParsedNote(workspace, note)).toMatchObject({
      status: "invalid-profile",
    });
  });
});
