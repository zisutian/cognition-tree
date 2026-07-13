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
} from "../../../../src/workspace/model/noteTree/mutations";
import {
  createNoteTreeFolderNode,
} from "../../../../src/workspace/model/noteTree/create";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../../src/workspace/model/workspaceData";
import {
  getUiTargetPositionLabel,
} from "../../../../src/application/workspace/projection/viewStructureOperation";
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

  return document.roots[1];
}

function createWorkspace() {
  const sourceNote = createNoteRecord("note-source", "源笔记", timestamp);
  const targetNote = createNoteRecord("note-target", "目标笔记", timestamp);
  const workspace = createInitialWorkspaceData();
  const treeWithSourceNote = appendNoteToWorkspaceTree(
    workspace.tree,
    sourceNote.id,
    null,
  );
  const treeWithFolder = appendFolderToWorkspaceTree(
    treeWithSourceNote,
    createNoteTreeFolderNode("folder-project", "项目"),
    null,
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
    const root = parseFirstRoot("标题\n主题 [[全局概念]] 和 `code`");
    const segments = createUiTextSegments(root);

    expect(segments).toMatchObject([
      { id: "block-2-text-0", kind: "text", text: "主题 " },
      {
        id: "2-4-global-reference",
        kind: "inline",
        text: "全局概念",
        textColor: "cyan",
        tone: "blue",
      },
      { id: "block-2-text-11", kind: "text", text: " 和 " },
      {
        id: "2-15-inline-code",
        kind: "inline",
        text: "code",
        textColor: "green",
        tone: "green",
      },
    ]);
    expect(getUiTextDisplayText(segments)).toBe("主题 全局概念 和 code");
  });

  it("keeps single inline syntax visible as the underlined content", () => {
    const root = parseFirstRoot("标题\n甲 \\ 乙");

    expect(createUiTextSegments(root)).toMatchObject([
      { id: "block-2-text-0", kind: "text", text: "甲 " },
      {
        id: "2-3-parallel-separator",
        kind: "inline",
        text: "\\",
        textColor: "amber",
        tone: "amber",
      },
      { id: "block-2-text-3", kind: "text", text: " 乙" },
    ]);
  });

  it("prepares note trees for UI rendering", () => {
    const workspace = createWorkspace();
    const noteTree = createUiNoteTree({
      notes: workspace.notes,
      tree: workspace.tree,
    });

    expect(noteTree[0]).toMatchObject({
      canDrag: true,
      folderId: null,
      kind: "note",
      noteId: "note-source",
      parentFolderId: null,
      title: "源笔记",
    });
    expect(noteTree[1]).toMatchObject({
      canDrag: true,
      folderId: "folder-project",
      kind: "folder",
      parentFolderId: null,
      title: "项目",
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

  it("labels structure operation target position values", () => {
    expect(getUiTargetPositionLabel("inside:1")).toBe("作为子结点");
    expect(() => getUiTargetPositionLabel("inside:0")).toThrow(
      "Invalid structure operation target position",
    );
  });

  it("maps syntax draft state into UI display data", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    const view = createUiSyntaxView({
      draft,
      draftResult: buildSyntaxProfileDraft(draft),
      feedback: null,
    });

    expect(view.draft.tabDisplayWidth).toBe("4");
    expect(view.constraints).toEqual({
      label: { maxLength: 32 },
      profileName: { maxLength: 64 },
      tabDisplayWidth: { max: 16, min: 1 },
      token: { maxLength: 12 },
    });
    expect(view.stats.lineRuleCount).toBe(
      defaultCtnSyntaxProfile.markerRules.length + 2,
    );
    expect(view.draft.titleRule).toMatchObject({
      label: "标题",
      type: "title",
    });
    expect(view.draft.markerRules.map((rule) => rule.type)).not.toContain(
      "title",
    );
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
