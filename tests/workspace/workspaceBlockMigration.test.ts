import { describe, expect, it } from "vitest";
import {
  appendNoteToWorkspaceTree,
  findFolderIdContainingNote,
} from "../../src/domain/noteTree";
import {
  createInitialWorkspace,
  createNoteRecord,
  type NoteWorkspace,
} from "../../src/domain/notes";
import {
  moveWorkspaceBlock,
  previewWorkspaceBlockMigration,
} from "../../src/workspace/workspaceBlockMigration";
import { defaultCtnSyntaxProfile } from "../../src/syntax/defaultSyntaxProfile";
import type { CtnSyntaxProfile } from "../../src/syntax/types";

const timestamp = "2026-06-08T00:00:00.000Z";

function createMigrationWorkspace(
  targetProfile: CtnSyntaxProfile = defaultCtnSyntaxProfile,
): NoteWorkspace {
  const sourceNote = createNoteRecord(
    "note-source",
    "Root\n    : Definition\n        - Component\nSibling",
    timestamp,
    defaultCtnSyntaxProfile,
  );
  const targetNote = createNoteRecord(
    "note-target",
    "Target\n    > Understanding",
    timestamp,
    targetProfile,
  );
  const workspace = createInitialWorkspace();

  return {
    ...workspace,
    activeNoteId: sourceNote.id,
    notes: [sourceNote, targetNote],
    syntaxProfiles:
      targetProfile.id === defaultCtnSyntaxProfile.id
        ? [defaultCtnSyntaxProfile]
        : [defaultCtnSyntaxProfile, targetProfile],
    tree: appendNoteToWorkspaceTree(
      appendNoteToWorkspaceTree(workspace.tree, sourceNote.id),
      targetNote.id,
    ),
  };
}

describe("workspace block migration", () => {
  it("moves a block subtree and updates both note records", () => {
    const workspace = createMigrationWorkspace();
    const result = moveWorkspaceBlock(
      workspace,
      {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "after-block", lineNumber: 1 },
      },
      "2026-06-08T01:00:00.000Z",
    );

    expect(result.status).toBe("moved");

    if (result.status !== "moved") {
      throw new Error(result.message);
    }

    expect(result.workspace.activeNoteId).toBe("note-target");
    expect(result.workspace.notes.find((note) => note.id === "note-source"))
      .toMatchObject({
        source: "Root\nSibling",
        title: "Root",
        updatedAt: "2026-06-08T01:00:00.000Z",
      });
    expect(result.workspace.notes.find((note) => note.id === "note-target"))
      .toMatchObject({
        source:
          "Target\n    > Understanding\n: Definition\n    - Component",
        title: "Target",
        updatedAt: "2026-06-08T01:00:00.000Z",
      });
    expect(findFolderIdContainingNote(result.workspace.tree, "note-target")).toBe(
      "folder-inbox",
    );
  });

  it("rejects invalid migration requests before editing the workspace", () => {
    const workspace = createMigrationWorkspace();

    expect(
      moveWorkspaceBlock(
        workspace,
        {
          sourceBlockLineNumber: 1,
          sourceNoteId: "note-source",
          targetNoteId: "note-source",
          targetPosition: { kind: "end" },
        },
        timestamp,
      ),
    ).toMatchObject({
      message: "第一版不支持同一笔记内移动块。",
      status: "failed",
    });
    expect(
      moveWorkspaceBlock(
        workspace,
        {
          sourceBlockLineNumber: 99,
          sourceNoteId: "note-source",
          targetNoteId: "note-target",
          targetPosition: { kind: "end" },
        },
        timestamp,
      ),
    ).toMatchObject({
      message: "源块不存在。",
      status: "failed",
    });
    expect(
      moveWorkspaceBlock(
        workspace,
        {
          sourceBlockLineNumber: 1,
          sourceNoteId: "note-source",
          targetNoteId: "note-target",
          targetPosition: { kind: "after-block", lineNumber: 99 },
        },
        timestamp,
      ),
    ).toMatchObject({
      message: "目标插入位置不存在。",
      status: "failed",
    });
  });

  it("rejects target syntax that does not support moved markers", () => {
    const targetProfile = {
      ...defaultCtnSyntaxProfile,
      id: "ctn-minimal",
      markerRules: [{ marker: "```", type: "code", label: "代码块", role: "code", tone: "code" }],
    } satisfies CtnSyntaxProfile;
    const workspace = createMigrationWorkspace(targetProfile);
    const result = moveWorkspaceBlock(
      workspace,
      {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "end" },
      },
      timestamp,
    );

    expect(result).toEqual({
      message: "目标笔记语法不支持 marker: :, -。",
      missingMarkers: [":", "-"],
      status: "failed",
    });
  });

  it("previews migration readiness and blocked states", () => {
    const workspace = createMigrationWorkspace();

    expect(
      previewWorkspaceBlockMigration(workspace, {
        sourceBlockLineNumber: 2,
        sourceNoteId: "note-source",
        targetNoteId: "note-target",
        targetPosition: { kind: "end" },
      }),
    ).toEqual({
      message: "当前选择可迁移。",
      status: "ready",
    });
    expect(
      previewWorkspaceBlockMigration(workspace, {
        sourceBlockLineNumber: null,
        sourceNoteId: null,
        targetNoteId: "note-target",
        targetPosition: { kind: "end" },
      }),
    ).toEqual({
      message: "源笔记或目标笔记未选定。",
      status: "idle",
    });
  });
});
