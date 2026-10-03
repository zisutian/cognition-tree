import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createWorkspaceDomainContext,
  createWorkspaceSourceReplacement,
  prepareWorkspaceMutation,
  type WorkspaceDomainVersions,
} from "../../../../../application/workspace/commands/workspaceDomainCommands";
import { DomainNotFoundError } from "../../../../../core/errors/index";
import { DomainResourceConflictError } from "../../../../../application/commands/index";
import { defaultCtnSyntax } from "../../../../../core/ctn/syntax/defaultSyntax";
import {
  createCanonicalTestNote,
  createWorkspaceDataWithNotes,
  createWorkspaceTestBlockId,
  readEditableTestSource,
} from "../../../../support/core/workspace/workspaceTestFixture";

const timestamp = "2026-10-03T13:00:00.000Z";
const digest = (value: unknown): `sha256:${string}` => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const versions: WorkspaceDomainVersions = {
  folder: (id, title) => digest({ id, title }), note: digest, tree: digest,
};
function fixture() {
  const workspace = createWorkspaceDataWithNotes([
    createCanonicalTestNote("source", "Source\nFirst\nSecond\nLast"),
    createCanonicalTestNote("target", "Target\nExisting", { idOffset: 100 }),
  ]);
  const context = createWorkspaceDomainContext({ workspace, syntax: defaultCtnSyntax });
  const sourceId = context.index!.getParsedNote("source")!.analysis.document.blocks[1].id;
  const targetId = context.index!.getParsedNote("target")!.analysis.document.blocks[1].id;
  return { context, sourceId, targetId };
}

describe("workspace batch mutation boundary", () => {
  it("resolves saved stable IDs from the latest analysis after source and target lines change", () => {
    const { context, sourceId, targetId } = fixture();
    const edited = prepareWorkspaceMutation({
      context, createBlockId: () => createWorkspaceTestBlockId(900),
      command: { kind: "replace-note-source", noteId: "source", timestamp,
        change: createWorkspaceSourceReplacement(context, "source", "Source\nInserted\nFirst\nSecond\nLast") },
    });
    const targetEdited = prepareWorkspaceMutation({
      context: edited.context, createBlockId: () => createWorkspaceTestBlockId(901),
      command: { kind: "replace-note-source", noteId: "target", timestamp,
        change: createWorkspaceSourceReplacement(edited.context, "target", "Target\nInserted\nExisting") },
    });
    expect(targetEdited.context.index!.getParsedNote("source")!.analysis.document.blocks.find((block) => block.id === sourceId)!.text).toBe("First");
    const moved = prepareWorkspaceMutation({
      context: targetEdited.context, createBlockId: () => { throw new Error("A move must preserve identities"); },
      command: { kind: "move-blocks", sourceNoteId: "source", sourceBlockIds: [sourceId], targetNoteId: "target", target: { kind: "above", targetBlockId: targetId }, timestamp },
    });
    expect(readEditableTestSource(moved.content.notes.find((note) => note.id === "source")!.source)).toBe("Source\nInserted\nSecond\nLast");
    expect(readEditableTestSource(moved.content.notes.find((note) => note.id === "target")!.source)).toBe("Target\nInserted\nFirst\nExisting");
    expect(moved.context.index!.blockIdRegistry.ownerByBlockId.get(sourceId)).toBe("target");
    expect(moved.context.index!.blockIdRegistry.ownerByBlockId.get(targetId)).toBe("target");
    expect(moved.context.index!.analysisStats.runCount).toBe(0);
  });
  it("preserves the missing resource identity for existing single-item error protocols", () => {
    const { context, sourceId } = fixture();
    let caught: unknown;
    try {
      prepareWorkspaceMutation({
        context, createBlockId: () => { throw new Error("A rejected move must not allocate IDs"); },
        command: { kind: "move-blocks", sourceNoteId: "source", sourceBlockIds: [sourceId, "gone-block"], targetNoteId: "target", target: { kind: "end" }, timestamp },
      });
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(DomainNotFoundError);
    expect(caught).toMatchObject({ resourceId: "gone-block" });
  });
  it.each(["source", "target", "tree"])("rejects a stale %s version before preparing a batch change", (resource) => {
    const { context, sourceId } = fixture();
    const source = context.structure.noteEntryById.get("source")!.note;
    const target = context.structure.noteEntryById.get("target")!.note;
    const before = structuredClone(context.structure.data);
    const command = resource === "tree"
      ? { kind: "move-tree-nodes" as const, request: { sources: [{ kind: "note" as const, noteId: "source" }], destination: { kind: "root" as const } }, expectedTreeVersion: digest("stale"), timestamp }
      : { kind: "move-blocks" as const, sourceNoteId: "source", sourceBlockIds: [sourceId], targetNoteId: "target", target: { kind: "end" as const }, timestamp,
          expectedSourceVersion: resource === "source" ? digest("stale") : versions.note(source.source),
          expectedTargetVersion: resource === "target" ? digest("stale") : versions.note(target.source) };
    expect(() => prepareWorkspaceMutation({ context, command, versions, createBlockId: () => { throw new Error("Must not allocate an identity"); } })).toThrow(DomainResourceConflictError);
    expect(context.structure.data).toEqual(before);
  });
});
