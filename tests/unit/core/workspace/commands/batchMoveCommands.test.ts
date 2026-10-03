import { describe, expect, it } from "vitest";
import {
  createWorkspaceParseIndex,
  createWorkspaceStructureIndex,
  moveWorkspaceStructureBlocks,
  moveWorkspaceTreeNodes,
  moveWorkspaceTreeNode,
  type NoteTreeNode,
  type NoteTreeNodeReference,
  type WorkspaceData,
} from "../../../../../core/workspace/index";
import { defaultCtnSyntax } from "../../../../../core/ctn/syntax/defaultSyntax";
import {
  createCanonicalTestNote,
  createWorkspaceDataWithNotes,
  readEditableTestSource,
} from "../../../../support/core/workspace/workspaceTestFixture";

const movedAt = "2026-10-03T12:00:00.000Z";
const note = (noteId: string): NoteTreeNode => ({ kind: "note", noteId });
const folder = (folderId: string, title: string, children: NoteTreeNode[] = []): NoteTreeNode => ({ kind: "folder", folderId, title, children });
const reference = (id: string) => ({ kind: "note" as const, noteId: id });
function directoryWorkspace(): WorkspaceData {
  return {
    ...createWorkspaceDataWithNotes(["One", "Two", "Three", "Four"].map((title, index) =>
      createCanonicalTestNote(`n${index + 1}`, title, { idOffset: index * 100 }))),
    tree: [folder("a", "A", [note("n1"), folder("child", "Child", [note("n2")])]), note("n4"), folder("b", "B", [note("n3")])],
  };
}
function moveBlocks(data: WorkspaceData, sourceBlockIds: readonly string[], targetNoteId = "source", target: { kind: "end" } | { kind: "inside" | "above" | "below"; targetBlockId: string } = { kind: "end" }) {
  const workspace = createWorkspaceStructureIndex(data);
  const index = createWorkspaceParseIndex({ syntax: defaultCtnSyntax, workspace });
  return moveWorkspaceStructureBlocks(workspace, index, { sourceBlockIds, sourceNoteId: "source", targetNoteId, target }, movedAt);
}
function contentWorkspace(source = "Source\nParent\n\t: Child\n\t\t- Grandchild\nKeep\nLast\n\t> Last child") {
  return createWorkspaceDataWithNotes([
    createCanonicalTestNote("source", source),
    createCanonicalTestNote("target", "Target\nExisting\n\t: Existing child", { idOffset: 100 }),
  ]);
}
function blocksOf(data: WorkspaceData, noteId = "source") {
  const workspace = createWorkspaceStructureIndex(data);
  return createWorkspaceParseIndex({ syntax: defaultCtnSyntax, workspace }).getParsedNote(noteId)!.analysis.document.blocks;
}
function idOf(data: WorkspaceData, text: string, noteId = "source") {
  return blocksOf(data, noteId).find((block) => block.text === text)!.id;
}
const editable = (data: WorkspaceData, id: string) => readEditableTestSource(data.notes.find((entry) => entry.id === id)!.source);

describe("batch directory moves", () => {
  it("moves mixed roots in tree order, carrying overlapping descendants only once", () => {
    const data = directoryWorkspace();
    const before = structuredClone(data);
    const moved = moveWorkspaceTreeNodes(createWorkspaceStructureIndex(data), {
      sources: [reference("n4"), { kind: "folder", folderId: "child" }, { kind: "folder", folderId: "a" }, reference("n1")],
      destination: { kind: "inside", folderId: "b" },
    });
    expect(moved.tree).toEqual([folder("b", "B", [note("n3"), before.tree[0], note("n4")])]);
    expect(moved.notes).toBe(data.notes);
    expect(data).toEqual(before);
  });
  it("places nonadjacent siblings after all sources are removed and excludes their own names", () => {
    const data = { ...directoryWorkspace(), tree: [note("n1"), note("n2"), note("n3"), note("n4")] };
    const moved = moveWorkspaceTreeNodes(createWorkspaceStructureIndex(data), {
      sources: [reference("n4"), reference("n1")], destination: { kind: "before", target: reference("n3") },
    });
    expect(moved.tree).toEqual([note("n2"), note("n1"), note("n4"), note("n3")]);
    expect(moveWorkspaceTreeNodes(createWorkspaceStructureIndex(moved), {
      sources: [reference("n1"), reference("n4")], destination: { kind: "after", target: reference("n2") },
    })).toBe(moved);
  });
  it("appends roots from different parents and preserves the single-item command", () => {
    const data = directoryWorkspace();
    const moved = moveWorkspaceTreeNodes(createWorkspaceStructureIndex(data), { sources: [reference("n3"), reference("n1")], destination: { kind: "root" } });
    expect(moved.tree).toEqual([folder("a", "A", [folder("child", "Child", [note("n2")])]), note("n4"), folder("b", "B"), note("n1"), note("n3")]);
    const request = { source: reference("n4"), destination: { kind: "inside" as const, folderId: "b" } };
    expect(moveWorkspaceTreeNode(createWorkspaceStructureIndex(data), request)).toEqual(moveWorkspaceTreeNodes(createWorkspaceStructureIndex(data), { sources: [request.source], destination: request.destination }));
  });
  it.each(["missing-source", "cycle", "missing-target", "target-name", "batch-name", "illegal-name", "empty"])("rejects %s without changing any input", (kind) => {
    const data = directoryWorkspace();
    let sources: NoteTreeNodeReference[] = [reference("n1"), reference("n4")];
    let destination: Parameters<typeof moveWorkspaceTreeNodes>[1]["destination"] = { kind: "inside", folderId: "b" };
    if (kind === "missing-source") sources.push(reference("missing"));
    if (kind === "cycle") {
      data.tree[0] = folder("a", "A", [folder("child", "Child", [note("n1"), note("n2")])]);
      sources = [{ kind: "folder", folderId: "a" }, reference("n4")];
      destination = { kind: "inside", folderId: "child" };
    }
    if (kind === "missing-target") destination = { kind: "inside", folderId: "gone" };
    if (kind === "target-name") data.notes[2] = createCanonicalTestNote("n3", "One", { idOffset: 200 });
    if (kind === "batch-name") data.notes[3] = createCanonicalTestNote("n4", "One", { idOffset: 300 });
    if (kind === "illegal-name") data.notes[0] = createCanonicalTestNote("n1", "bad/name");
    if (kind === "empty") sources = [];
    const before = structuredClone(data);
    expect(() => moveWorkspaceTreeNodes(createWorkspaceStructureIndex(data), { sources, destination })).toThrow();
    expect(data).toEqual(before);
  });
  it("checks folder/note collisions within a batch using the existing portable name key", () => {
    const data = directoryWorkspace();
    data.tree[0] = folder("a", "Four", [note("n1"), note("n2")]);
    expect(() => moveWorkspaceTreeNodes(createWorkspaceStructureIndex(data), {
      sources: [{ kind: "folder", folderId: "a" }, reference("n4")], destination: { kind: "inside", folderId: "b" },
    })).toThrow("同名");
  });
});

describe("batch structure moves", () => {
  it.each(["source", "target"])("moves noncontinuous subtrees to %s in source order with stable identities", (targetNoteId) => {
    const data = contentWorkspace();
    const before = structuredClone(data);
    const sourceIds = blocksOf(data).map((block) => block.id);
    const result = moveBlocks(data, [idOf(data, "Last"), idOf(data, "Child"), idOf(data, "Parent"), idOf(data, "Parent")], targetNoteId);
    expect(result.status).toBe("moved");
    if (result.status !== "moved") throw new Error(result.reason);
    expect(editable(result.workspaceData, targetNoteId)).toBe(targetNoteId === "source"
      ? "Source\nKeep\nParent\n\t: Child\n\t\t- Grandchild\nLast\n\t> Last child"
      : "Target\nExisting\n\t: Existing child\nParent\n\t: Child\n\t\t- Grandchild\nLast\n\t> Last child");
    if (targetNoteId === "target") expect(editable(result.workspaceData, "source")).toBe("Source\nKeep");
    const next = createWorkspaceParseIndex({ syntax: defaultCtnSyntax, workspace: createWorkspaceStructureIndex(result.workspaceData), analysisOverrides: result.analysisOverrides }, createWorkspaceParseIndex({ syntax: defaultCtnSyntax, workspace: createWorkspaceStructureIndex(data) }));
    expect(next.analysisStats.runCount).toBe(0);
    for (const id of sourceIds) expect(next.blockIds.has(id)).toBe(true);
    for (const block of blocksOf(data).filter((block) => block.text !== "Source" && block.text !== "Keep")) {
      expect(next.blockIdRegistry.ownerByBlockId.get(block.id)).toBe(targetNoteId);
    }
    expect(data).toEqual(before);
  });
  it("moves roots at different depths with multiline content and inline references intact", () => {
    const data = contentWorkspace("Source\nParent\n\t```\n\t  local @(ref)\n\t\t~(Target)\n\t```\nKeep\nLast\n\t: Child");
    const multiline = blocksOf(data).find((block) => block.rule.kind === "multiline")!;
    const result = moveBlocks(data, [idOf(data, "Last"), multiline.id], "target", { kind: "inside", targetBlockId: idOf(data, "Existing", "target") });
    if (result.status !== "moved") throw new Error(result.reason);
    expect(editable(result.workspaceData, "target")).toBe("Target\nExisting\n\t: Existing child\n\t```\n\t  local @(ref)\n\t\t~(Target)\n\t```\n\tLast\n\t\t: Child");
    const transferred = blocksOf(result.workspaceData, "target").find((block) => block.id === multiline.id)!;
    expect(transferred.contentFingerprint).toContain("local @(ref)");
    expect(transferred.metadata.createdAt).toBe(multiline.metadata.createdAt);
  });
  it.each(["above", "below", "inside"] as const)("resolves a stable %s target after removing nonadjacent roots", (kind) => {
    const data = contentWorkspace();
    const result = moveBlocks(data, [idOf(data, "Last"), idOf(data, "Parent")], "source", { kind, targetBlockId: idOf(data, "Keep") });
    if (result.status !== "moved") throw new Error(result.reason);
    expect(blocksOf(result.workspaceData).filter((block) => block.level === 0).map((block) => block.text)).toEqual(kind === "above" ? ["Source", "Parent", "Last", "Keep"] : kind === "below" ? ["Source", "Keep", "Parent", "Last"] : ["Source", "Keep"]);
    expect(new Set(blocksOf(result.workspaceData).map((block) => block.id))).toEqual(new Set(blocksOf(data).map((block) => block.id)));
  });
  it.each(["end", "inside"] as const)("rejects an unclosed target subtree at %s before transferring identities", (kind) => {
    const data = contentWorkspace();
    data.notes[1] = createCanonicalTestNote("target", "Target\nParent\n\t```\n\tunfinished", { idOffset: 100 });
    const before = structuredClone(data);
    const target = kind === "end" ? { kind } : { kind, targetBlockId: idOf(data, "Parent", "target") };
    expect(moveBlocks(data, [idOf(data, "Keep")], "target", target)).toMatchObject({ status: "failed", reason: "invalid-block-range" });
    expect(data).toEqual(before);
  });
  it("rejects a parse index from an earlier source version", () => {
    const data = contentWorkspace();
    const old = createWorkspaceStructureIndex(data);
    const index = createWorkspaceParseIndex({ syntax: defaultCtnSyntax, workspace: old });
    const id = index.getParsedNote("source")!.analysis.document.blocks[1].id;
    const changed = { ...data, notes: [createCanonicalTestNote("source", "Source\nChanged"), data.notes[1]] };
    expect(moveWorkspaceStructureBlocks(createWorkspaceStructureIndex(changed), index, { sourceNoteId: "source", sourceBlockIds: [id], targetNoteId: "target", target: { kind: "end" } }, movedAt))
      .toMatchObject({ status: "failed", reason: "parsed-note-missing" });
  });
  it("returns an unchanged successful result without touching timestamps", () => {
    const data = contentWorkspace();
    const result = moveBlocks(data, [idOf(data, "Last")]);
    if (result.status !== "moved") throw new Error(result.reason);
    expect(result.workspaceData).toBe(data);
  });
  it.each([
    ["empty", "empty-source"], ["missing", "source-block-missing"], ["title", "source-block-missing"],
    ["target-title", "target-position-missing"], ["inside-source", "target-inside-source"], ["missing-target", "target-position-missing"],
    ["unclosed", "invalid-block-range"],
  ])("rejects the entire %s request before replacing any note", (kind, reason) => {
    const data = kind === "unclosed" ? contentWorkspace("Source\nKeep\n```\nunfinished") : contentWorkspace();
    let ids = [idOf(data, "Keep")];
    let target: Parameters<typeof moveBlocks>[3] = { kind: "end" };
    if (kind === "empty") ids = [];
    if (kind === "missing") ids.push("gone");
    if (kind === "title") ids.push(blocksOf(data)[0].id);
    if (kind === "target-title") target = { kind: "inside", targetBlockId: blocksOf(data)[0].id };
    if (kind === "inside-source") { ids.push(idOf(data, "Parent")); target = { kind: "inside", targetBlockId: idOf(data, "Grandchild") }; }
    if (kind === "missing-target") target = { kind: "below", targetBlockId: "gone" };
    if (kind === "unclosed") ids.push(blocksOf(data).at(-1)!.id);
    const before = structuredClone(data);
    expect(moveBlocks(data, ids, "source", target)).toMatchObject({ status: "failed", reason });
    expect(data).toEqual(before);
  });
});
