import { describe, expect, it } from "vitest";
import { parseCtnDocument } from "../../../../src/ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../../src/ctn/syntax/defaultSyntaxProfile";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
} from "../../../../src/ctn/syntax/profileDraft";
import type { CtnBlock } from "../../../../src/ctn/parser/types";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
  createNoteTreeFolderNode,
} from "../../../../src/workspace/model/noteTree";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../../src/workspace/model/workspaceData";
import {
  createUiBlockMigrationTargetPositionValue,
  getUiTargetPositionLabel,
  parseUiBlockMigrationTargetPosition,
} from "../../../../src/application/workspace/projection/viewMigration";
import {
  createUiBlockNode,
  flattenUiBlockSubtree,
  getUiBlockLineLabel,
} from "../../../../src/application/workspace/projection/viewBlocks";
import {
  createUiNoteTree,
} from "../../../../src/application/workspace/projection/viewTree";
import {
  createUiTextSegments,
  getUiTextDisplayText,
} from "../../../../src/application/workspace/projection/viewText";
import { createUiSyntaxView } from "../../../../src/application/workspace/projection/viewSyntax";

const timestamp = "2026-07-04T00:00:00.000Z";

function parseFirstRoot(source: string) {
  const document = parseCtnDocument(source, defaultCtnSyntaxProfile);

  return document.roots[0];
}

function createWorkspace() {
  const sourceNote = createNoteRecord("note-source", "源笔记", timestamp);
  const targetNote = createNoteRecord("note-target", "目标笔记", timestamp);
  const workspace = createInitialWorkspaceData();
  const treeWithSourceNote = appendNoteToWorkspaceTree(
    workspace.tree,
    sourceNote.id,
    "folder-inbox",
  );
  const treeWithFolder = appendFolderToWorkspaceTree(
    treeWithSourceNote,
    createNoteTreeFolderNode("folder-project", "项目"),
    "folder-inbox",
  );

  return {
    ...workspace,
    notes: [sourceNote, targetNote],
    tree: appendNoteToWorkspaceTree(
      treeWithFolder,
      targetNote.id,
      "folder-project",
    ),
  };
}

function createBlock(
  id: string,
  lineNumber: number,
  children: CtnBlock[] = [],
): CtnBlock {
  const lastChild = children[children.length - 1];

  return {
    children,
    diagnostics: [],
    endLineNumber: lastChild?.endLineNumber ?? lineNumber,
    id,
    indentText: "",
    inlineSpans: [],
    label: "组分",
    level: 0,
    lineNumber,
    marker: "-",
    rawText: `- Block ${id}`,
    role: "normal",
    text: `Block ${id}`,
    textColor: "green",
    tone: "green",
    type: "item",
  };
}

describe("workspace view projection", () => {
  it("creates outline text segments with syntax display metadata", () => {
    const root = parseFirstRoot("主题 [[全局概念]] 和 `code`");
    const segments = createUiTextSegments(root);

    expect(segments).toMatchObject([
      { id: "block-1-text-0", kind: "text", text: "主题 " },
      {
        id: "1-4-global-reference",
        kind: "inline",
        text: "全局概念",
        textColorClassName: "ctn-text-color-cyan",
        toneClassName: "ctn-tone-blue",
      },
      { id: "block-1-text-11", kind: "text", text: " 和 " },
      {
        id: "1-15-inline-code",
        kind: "inline",
        text: "code",
        textColorClassName: "ctn-text-color-green",
        toneClassName: "ctn-tone-green",
      },
    ]);
    expect(getUiTextDisplayText(segments)).toBe("主题 全局概念 和 code");
  });

  it("keeps single inline syntax visible as the underlined content", () => {
    const root = parseFirstRoot("甲 \\ 乙");

    expect(createUiTextSegments(root)).toMatchObject([
      { id: "block-1-text-0", kind: "text", text: "甲 " },
      {
        id: "1-3-parallel-separator",
        kind: "inline",
        text: "\\",
        textColorClassName: "ctn-text-color-amber",
        toneClassName: "ctn-tone-amber",
      },
      { id: "block-1-text-3", kind: "text", text: " 乙" },
    ]);
  });

  it("prepares note trees for UI rendering", () => {
    const workspace = createWorkspace();
    const noteTree = createUiNoteTree({
      includeOrphans: true,
      notes: [
        ...workspace.notes,
        { id: "note-orphan", title: "孤立笔记" },
      ],
      tree: workspace.tree,
    });

    expect(noteTree[0]).toMatchObject({
      canDrag: false,
      childCount: 2,
      folderId: "folder-inbox",
      kind: "folder",
      parentFolderId: null,
      title: "仓库根目录",
    });
    expect(noteTree[0]).toMatchObject({
      children: [
        {
          canDrag: true,
          folderId: "folder-inbox",
          kind: "note",
          noteId: "note-source",
          parentFolderId: "folder-inbox",
          title: "源笔记",
        },
        {
          canDrag: true,
          folderId: "folder-project",
          kind: "folder",
          parentFolderId: "folder-inbox",
          title: "项目",
        },
      ],
    });
    expect(noteTree[noteTree.length - 1]).toMatchObject({
      canDrag: false,
      id: "workspace-orphan-note-orphan",
      kind: "note",
      noteId: "note-orphan",
      parentFolderId: null,
      title: "孤立笔记",
    });
  });

  it("formats block labels and flattens block subtrees", () => {
    const child = createBlock("child", 2);
    const root = createBlock("root", 1, [child]);
    const viewNode = createUiBlockNode(root);

    expect(getUiBlockLineLabel(root)).toBe("L1-2");
    expect(viewNode.textDisplay.displayText).toBe("Block root");
    expect(flattenUiBlockSubtree(viewNode).map((block) => block.id)).toEqual([
      "root",
      "child",
    ]);
  });

  it("parses and labels migration target position values", () => {
    expect(parseUiBlockMigrationTargetPosition("end")).toEqual({
      kind: "end",
    });
    expect(parseUiBlockMigrationTargetPosition("inside:12")).toEqual({
      kind: "inside-block",
      lineNumber: 12,
    });
    expect(parseUiBlockMigrationTargetPosition("sibling-above:12")).toEqual({
      kind: "sibling-above",
      lineNumber: 12,
    });
    expect(parseUiBlockMigrationTargetPosition("sibling-below:12")).toEqual({
      kind: "sibling-below",
      lineNumber: 12,
    });
    expect(getUiTargetPositionLabel("inside:1")).toBe("作为子结点");
    expect(() => parseUiBlockMigrationTargetPosition("unknown:12")).toThrow(
      "Invalid block migration target position",
    );
    expect(() => getUiTargetPositionLabel("inside:0")).toThrow(
      "Invalid block migration target position",
    );
  });

  it("serializes migration target positions", () => {
    expect(createUiBlockMigrationTargetPositionValue({ kind: "end" })).toBe(
      "end",
    );
    expect(
      createUiBlockMigrationTargetPositionValue({
        kind: "inside-block",
        lineNumber: 7,
      }),
    ).toBe("inside:7");
    expect(
      createUiBlockMigrationTargetPositionValue({
        kind: "sibling-above",
        lineNumber: 7,
      }),
    ).toBe("sibling-above:7");
    expect(
      createUiBlockMigrationTargetPositionValue({
        kind: "sibling-below",
        lineNumber: 7,
      }),
    ).toBe("sibling-below:7");
  });

  it("maps syntax draft state into UI display data", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    const view = createUiSyntaxView({
      draft,
      draftResult: buildSyntaxProfileDraft(draft),
      feedback: null,
    });

    expect(view.draft.tabDisplayWidth).toBe("4");
    expect(view.draftResult.diagnostics).toEqual([]);
    expect(view.draftResult.profile).toMatchObject({
      name: "默认 CTN 语法",
      tabDisplayWidth: 4,
    });
    expect(view.draftResult.profile?.inlineRules[0]).toMatchObject({
      close: "]]",
      kind: "paired",
      label: "全局概念引用",
      marker: "",
      open: "[[",
    });
    expect("id" in view.draftResult.profile!.inlineRules[0]).toBe(false);
  });
});
