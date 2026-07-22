import { describe, expect, it } from "vitest";
import { parseCtnCanonicalDocument } from "../../../../core/ctn/parser/parseCtnDocument";
import { defaultCtnSyntaxProfile } from "../../../../core/ctn/syntax/defaultSyntaxProfile";
import {
  createSyntaxProfileDraft,
} from "../../../../core/ctn/syntax/profileDraft";
import type { CtnCanonicalBlock } from "../../../../core/ctn/parser/types";
import {
  appendFolderToWorkspaceTree,
  appendNoteToWorkspaceTree,
} from "../../../../core/workspace/model/noteTree/mutations";
import {
  createNoteTreeFolderNode,
} from "../../../../core/workspace/model/noteTree/create";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  readWorkspaceNoteHeader,
} from "../../../../core/workspace/model/workspaceData";
import {
  createUiBlockNode,
  createUiOutlineNodes,
  findUiOutlineNodeAtLine,
  flattenUiBlockSubtree,
  getUiBlockLineLabel,
} from "../../../../src/application/workspace/projection/viewBlocks";
import {
  createUiNoteTree,
} from "../../../../src/application/workspace/projection/viewTree";
import { createUiEditorView } from "../../../../src/application/workspace/projection/viewEditor";
import {
  createCtnEditableSource,
  getCtnEditableLineNumber,
} from "../../../../core/ctn/metadata/editableSource";
import {
  createUiTextSegments,
  getUiTextDisplayText,
} from "../../../../src/application/workspace/projection/viewText";
import { createUiSyntaxView } from "../../../../src/application/workspace/projection/viewSyntax";
import {
  addTestCtnBlockMetadata,
  createTestBlockId,
  testBlockTimestamp,
} from "../../../ctn/metadata/sourceMetadataFixture";

const timestamp = "2026-07-04T00:00:00.000Z";

function parseFirstRoot(source: string) {
  const document = parseCtnCanonicalDocument(
    addTestCtnBlockMetadata(source),
    defaultCtnSyntaxProfile,
  );

  return document.roots[1];
}

function createWorkspace() {
  const sourceNote = createNoteRecord(
    "note-source",
    addTestCtnBlockMetadata("源笔记"),
  );
  const targetNote = createNoteRecord(
    "note-target",
    addTestCtnBlockMetadata("目标笔记", defaultCtnSyntaxProfile, 100),
  );
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
  children: CtnCanonicalBlock[] = [],
): CtnCanonicalBlock {
  const lastChild = children[children.length - 1];
  const subtreeEndLineNumber =
    lastChild?.subtreeEndLineNumber ?? lineNumber;

  return {
    children,
    contentFingerprint: `- Block ${id}`,
    diagnostics: [],
    id,
    indentText: "",
    inlineSpans: [],
    label: "组分",
    level: 0,
    lexicalEndLineNumber: lineNumber,
    lineNumber,
    marker: "-",
    metadata: {
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    metadataLineNumber: lineNumber,
    multilineRange: null,
    rawText: `- Block ${id}`,
    role: "normal",
    subtreeEndLineNumber,
    text: `Block ${id}`,
    textColor: "green",
    textStartColumn: 3,
    tone: "green",
    type: "item",
  };
}

describe("workspace view projection", () => {
  it("projects unparsed note text as an explicit raw editor", () => {
    const view = createUiEditorView({
      document: null,
      documentText: "缩进?内容",
      errorMessage: "",
      focusTarget: null,
      syntaxProfile: defaultCtnSyntaxProfile,
    });

    expect(view).toMatchObject({
      documentText: "缩进?内容",
      mode: "raw",
      stats: { lineCount: 1, rootCount: 0, totalBlocks: 0 },
    });
  });

  it("projects canonical metadata lines out of parsed editor views", () => {
    const source = addTestCtnBlockMetadata(
      "Title\nRoot\n\t? Unknown",
    );
    const document = parseCtnCanonicalDocument(
      source,
      defaultCtnSyntaxProfile,
    );
    const editableSource = createCtnEditableSource(
      source,
      defaultCtnSyntaxProfile,
    );
    const projectLineNumber = (lineNumber: number) =>
      getCtnEditableLineNumber(editableSource, lineNumber);
    const view = createUiEditorView({
      document,
      documentText: editableSource.source,
      errorMessage: "",
      focusTarget: null,
      syntaxProfile: defaultCtnSyntaxProfile,
    });
    const outline = createUiOutlineNodes(
      document.roots,
      projectLineNumber,
    );

    expect(view.documentText).toBe("Title\nRoot\n\t? Unknown");
    expect(view.stats.lineCount).toBe(3);
    expect(outline).toMatchObject([
      {
        endLineNumber: 3,
        lineLabel: "L2-3",
        lineNumber: 2,
        metadata: { createdAt: testBlockTimestamp },
      },
    ]);
  });

  it("creates outline text segments with syntax display metadata", () => {
    const root = parseFirstRoot("标题\n主题 [[全局概念]] 和 `code`");
    const segments = createUiTextSegments(root);
    const rootId = createTestBlockId(2);

    expect(segments).toMatchObject([
      { id: `${rootId}-text-0`, kind: "text", text: "主题 " },
      {
        id: "4-4-global-reference",
        kind: "inline",
        text: "全局概念",
        textColor: "cyan",
        tone: "blue",
      },
      { id: `${rootId}-text-11`, kind: "text", text: " 和 " },
      {
        id: "4-15-inline-code",
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
    const rootId = createTestBlockId(2);

    expect(createUiTextSegments(root)).toMatchObject([
      { id: `${rootId}-text-0`, kind: "text", text: "甲 " },
      {
        id: "4-3-parallel-separator",
        kind: "inline",
        text: "\\",
        textColor: "amber",
        tone: "amber",
      },
      { id: `${rootId}-text-3`, kind: "text", text: " 乙" },
    ]);
  });

  it("prepares note trees for UI rendering", () => {
    const workspace = createWorkspace();
    const noteTree = createUiNoteTree({
      notes: workspace.notes.map((note) => ({
        id: note.id,
        ...readWorkspaceNoteHeader(note),
      })),
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

  it("resolves the deepest outline block containing an editor line", () => {
    const child = createBlock("child", 3);
    const root = createBlock("root", 2, [child]);
    const multiline = {
      ...createBlock("multiline", 4),
      lexicalEndLineNumber: 7,
      multilineRange: {
        closingFenceLineNumber: 7,
        contentEndLineNumber: 6,
        contentStartLineNumber: 5,
        status: "closed" as const,
      },
      role: "multiline" as const,
      subtreeEndLineNumber: 7,
    };
    const outline = createUiOutlineNodes([root, multiline]);

    expect(findUiOutlineNodeAtLine(outline, 2)?.id).toBe("root");
    expect(findUiOutlineNodeAtLine(outline, 3)?.id).toBe("child");
    expect(findUiOutlineNodeAtLine(outline, 6)?.id).toBe("multiline");
    expect(findUiOutlineNodeAtLine(outline, 1)).toBeNull();
    expect(findUiOutlineNodeAtLine(outline, 8)).toBeNull();
    expect(findUiOutlineNodeAtLine(outline, Number.NaN)).toBeNull();
  });

  it("maps syntax draft state into UI display data", () => {
    const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
    const view = createUiSyntaxView({
      draft,
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
    expect(view.draft.inlineRules[0]).toMatchObject({
      close: "]]",
      kind: "paired",
      label: "全局概念引用",
      open: "[[",
    });
    expect(view.customToneLabel).toBe("自定义");
    expect(view.toneOptions).toEqual(
      expect.arrayContaining([
        { label: "绿色", value: "green" },
        { label: "琥珀", value: "amber" },
        { label: "灰色", value: "gray" },
      ]),
    );
    expect(view.focusTarget).toBeNull();
  });
});
