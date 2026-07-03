import { describe, expect, it } from "vitest";
import { createNoteRecord } from "../../../src/workspace/model/workspaceData";
import { defaultCtnSyntaxProfile } from "../../../src/ctn-syntax/defaultSyntaxProfile";
import { resolveParsedNoteView } from "../../../src/workspace/view-model/parsedNoteView";
import { createInitialWorkspaceRuntime } from "../../../src/workspace/runtime/workspaceRuntime";

const timestamp = "2026-06-08T00:00:00.000Z";

describe("resolveParsedNoteView", () => {
  it("parses notes with the workspace syntax profile", () => {
    const note = createNoteRecord(
      "note-first",
      "概念\n    : 定义",
      timestamp,
    );
    const workspace = {
      ...createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      notes: [note],
      activeNoteId: note.id,
    };
    const result = resolveParsedNoteView(workspace, note);

    expect(result.document.blocks.map((block) => block.label)).toEqual([
      "顶格概念",
      "定义",
    ]);
  });

  it("parses an empty document with the workspace syntax without an active note", () => {
    const result = resolveParsedNoteView(
      createInitialWorkspaceRuntime(defaultCtnSyntaxProfile),
      null,
    );

    expect(result).toMatchObject({
      document: { blocks: [], diagnostics: [], roots: [] },
      source: "",
    });
  });

});
