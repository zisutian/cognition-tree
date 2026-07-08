import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildSyntaxProfileDraft,
  createSyntaxProfileDraft,
} from "../../../src/ctn/syntax/profileDraft";
import { defaultCtnSyntaxProfile } from "../../../src/ctn/syntax/defaultSyntaxProfile";
import type { ViewModel } from "../../../src/application/workspace/view-model/useViewModel";
import { createUiSyntaxView } from "../../../src/application/workspace/projection/viewSyntax";
import {
  createActivitySlots,
  activityItems,
} from "../../../src/ui/activities/activityRegistry";
import type { ActivityId } from "../../../src/ui/activityTypes";

function renderSlot(slot: ReactNode) {
  return renderToStaticMarkup(<>{slot}</>);
}

function createView(overrides: Partial<ViewModel> = {}): ViewModel {
  const draft = createSyntaxProfileDraft(defaultCtnSyntaxProfile);
  const syntax = createUiSyntaxView({
    draft,
    draftResult: buildSyntaxProfileDraft(draft),
    feedback: null,
  });

  return {
    canChangeRepositoryPath: true,
    changeRepositoryPath: async () => undefined,
    createFolder: () => undefined,
    createNote: () => undefined,
    deleteFolder: () => undefined,
    deleteNote: () => undefined,
    editor: {
      currentNoteTitle: "当前笔记",
      diagnostics: [],
      documentText: "当前笔记",
      focusTarget: null,
      hasActiveNote: true,
      hasParsedDocument: true,
      stats: {
        diagnosticCount: 0,
        lineCount: 1,
        rootCount: 1,
        totalBlocks: 1,
      },
      syntaxProfile: defaultCtnSyntaxProfile,
      errorMessage: "",
    },
    focusEditorLine: () => undefined,
    hasConfiguredSyntax: true,
    migration: {
      mode: "pair",
      noteTree: [
        {
          canDrag: true,
          folderId: null,
          id: "tree-note-source",
          kind: "note",
          noteId: "note-source",
          parentFolderId: null,
          title: "Source note",
        },
        {
          canDrag: true,
          folderId: null,
          id: "tree-note-target",
          kind: "note",
          noteId: "note-target",
          parentFolderId: null,
          title: "Target note",
        },
      ],
      onMoveBlockToPosition: () => undefined,
      onMoveStructureBlock: () => undefined,
      onOpenNoteStructure: () => undefined,
      onPairNotesForMigration: () => undefined,
      sourceBlocks: [],
      sourceNote: { id: "note-source", title: "Source note" },
      sourceNoteId: "note-source",
      sourceRoots: [],
      structureBlocks: [],
      structureNote: { id: "note-source", title: "Source note" },
      structureNoteId: "note-source",
      structureRoots: [],
      targetNote: { id: "note-target", title: "Target note" },
      targetNoteId: "note-target",
      targetRoots: [],
    },
    moveNote: () => undefined,
    moveSidebarTreeNode: () => undefined,
    outline: {
      nodes: [],
      onSelectLine: () => undefined,
    },
    reload: async () => undefined,
    renameFolder: () => undefined,
    renameNote: () => undefined,
    selectFolder: () => undefined,
    selectNote: () => undefined,
    sidebar: {
      activeFolderId: null,
      activeNoteFolderId: null,
      activeNoteId: "note-1",
      noteTree: [],
      repositoryPath: "/workspace",
      saveStatusLabel: "已保存",
      storageLabel: "本地",
    },
    syntax: {
      ...syntax,
      actions: {
        addInlineRule: () => undefined,
        addMarkerRule: () => undefined,
        removeInlineRule: () => undefined,
        removeMarkerRule: () => undefined,
        updateConceptRule: () => undefined,
        updateDraftField: () => undefined,
        updateInlineRule: () => undefined,
        updateMarkerRule: () => undefined,
        updateTitleRule: () => undefined,
      },
      protectedInlineRuleIds: [],
    },
    updateActiveNoteSource: () => undefined,
    useDefaultSyntax: () => undefined,
    visualization: {
      activeNoteId: "note-1",
      graph: {
        edges: [],
        mostReferencedNodes: [],
        nodes: [],
        stats: {
          edgeCount: 0,
          isolatedCount: 0,
          nodeCount: 0,
        },
        unresolvedReferences: [],
      },
      onSelectNote: () => undefined,
    },
    errorMessage: "",
    ...overrides,
  };
}

function createSlots(activityId: ActivityId, view = createView()) {
  return createActivitySlots({
    activityId,
    onCollapseDetail: () => undefined,
    onConfigureSyntax: () => undefined,
    view,
  });
}

describe("activity registry", () => {
  it("defines every activity as a slot-backed activity", () => {
    expect(activityItems.map((item) => item.id)).toEqual([
      "notes",
      "migration",
      "visualization",
      "syntax",
      "search",
      "data",
      "settings",
    ]);

    activityItems.forEach((item) => {
      expect(createSlots(item.id).main).not.toBeNull();
    });
  });

  it("shows syntax setup for activities that require configured syntax", () => {
    const view = createView({ hasConfiguredSyntax: false });

    expect(renderSlot(createSlots("notes", view).main)).toContain(
      "仓库语法未配置",
    );
    expect(renderSlot(createSlots("migration", view).main)).toContain(
      "仓库语法未配置",
    );
    expect(renderSlot(createSlots("visualization", view).main)).toContain(
      "仓库语法未配置",
    );
    expect(renderSlot(createSlots("syntax", view).main)).toContain(
      "仓库语法配置",
    );
  });

  it("keeps placeholder activities from falling back to notes", () => {
    const searchMain = renderSlot(createSlots("search").main);
    const dataMain = renderSlot(createSlots("data").main);
    const settingsMain = renderSlot(createSlots("settings").main);
    const settingsSidebar = renderSlot(createSlots("settings").sidebar);

    expect(searchMain).toContain("搜索功能待接入");
    expect(dataMain).toContain("数据功能待接入");
    expect(settingsMain).toContain("仓库设置在侧栏中管理");
    expect(settingsSidebar).toContain("/workspace");
    expect(`${searchMain}${dataMain}${settingsMain}`).not.toContain("笔记编辑");
  });

  it("renders migration as a sidebar note tree plus block migration view", () => {
    const slots = createSlots("migration");
    const main = renderSlot(slots.main);
    const sidebar = renderSlot(slots.sidebar);

    expect(main).toContain("块迁移");
    expect(main).not.toContain("笔记结构调整");
    expect(main).toContain("源 · Source note");
    expect(main).toContain("目标 · Target note");
    expect(main).not.toContain("笔记选择");
    expect(sidebar).toContain("迁移目录");
    expect(sidebar).toContain("Source note");
    expect(sidebar).toContain("Target note");
  });

  it("renders migration structure mode as a single note block tree", () => {
    const baseView = createView();
    const view = createView({
      migration: {
        ...baseView.migration,
        mode: "structure",
        structureNote: { id: "note-source", title: "Source note" },
        structureNoteId: "note-source",
      },
    });
    const main = renderSlot(createSlots("migration", view).main);

    expect(main).toContain("笔记结构调整");
    expect(main).not.toContain("块迁移</h2>");
    expect(main).toContain("结构 · Source note");
    expect(main).toContain("当前笔记没有可调整块");
    expect(main).not.toContain("目标 · Target note");
  });

  it("adds collapse actions to right detail panels", () => {
    expect(renderSlot(createSlots("notes").detail)).toContain(
      "aria-label=\"收回右侧栏\"",
    );
    expect(renderSlot(createSlots("syntax").detail)).toContain(
      "aria-label=\"收回右侧栏\"",
    );
    expect(renderSlot(createSlots("visualization").detail)).toContain(
      "aria-label=\"收回右侧栏\"",
    );
  });

  it("moves note editor counts into the note detail panel", () => {
    const baseView = createView();
    const view = createView({
      editor: {
        ...baseView.editor,
        stats: {
          diagnosticCount: 4,
          lineCount: 69,
          rootCount: 8,
          totalBlocks: 55,
        },
      },
    });
    const main = renderSlot(createSlots("notes", view).main);
    const detail = renderSlot(createSlots("notes", view).detail);

    expect(main).toContain("当前：当前笔记");
    expect(main).not.toContain("69 行");
    expect(main).not.toContain("55 个块");
    expect(detail).toContain("aria-label=\"笔记统计\"");
    expect(detail).toContain("<dd>69</dd><dt>行</dt>");
    expect(detail).toContain("<dd>55</dd><dt>个块</dt>");
    expect(detail).toContain("<dd>8</dd><dt>个根节点</dt>");
    expect(detail).toContain("<dd>4</dd><dt>个诊断</dt>");
    expect(detail).not.toContain("当前笔记</dt>");
  });

  it("moves syntax and visualization counts into right detail panels", () => {
    const baseView = createView();
    const view = createView({
      visualization: {
        ...baseView.visualization,
        graph: {
          ...baseView.visualization.graph,
          stats: {
            edgeCount: 7,
            isolatedCount: 2,
            nodeCount: 9,
          },
        },
      },
    });
    const syntaxMain = renderSlot(createSlots("syntax", view).main);
    const syntaxDetail = renderSlot(createSlots("syntax", view).detail);
    const graphMain = renderSlot(createSlots("visualization", view).main);
    const graphDetail = renderSlot(createSlots("visualization", view).detail);

    expect(syntaxMain).not.toContain("ui-panel-stats");
    expect(syntaxMain).toContain("缩进宽度");
    expect(syntaxMain).toContain("块规则");
    expect(syntaxMain).toContain("首行标题");
    expect(syntaxMain).toContain("顶格概念");
    expect(syntaxMain).toContain("背景色");
    expect(syntaxMain).toContain("文字色");
    expect(syntaxMain).toContain("新增");
    expect(syntaxMain).toContain("成对符号");
    expect(syntaxMain).toContain("单个符号");
    expect(syntaxMain).not.toContain("syntax-inline-actions");
    expect(syntaxMain).not.toContain("Tab 宽度");
    expect(syntaxMain).not.toContain("行首规则");
    expect(syntaxMain).not.toContain("单符号");
    expect(syntaxDetail).toContain("aria-label=\"语法统计\"");
    expect(syntaxDetail).toContain("<dt>块规则</dt>");
    expect(syntaxDetail).toContain("<dt>行内规则</dt>");
    expect(syntaxDetail).toContain("<dt>问题</dt>");
    expect(syntaxDetail.match(/<dt>块规则<\/dt>/g)).toHaveLength(1);
    expect(syntaxDetail.match(/<dt>行内规则<\/dt>/g)).toHaveLength(1);
    expect(syntaxDetail).toContain("当前配置");
    expect(syntaxDetail).toContain("缩进宽度");
    expect(syntaxDetail).not.toContain("首行标题");
    expect(syntaxDetail).not.toContain("顶格概念");
    expect(syntaxDetail).not.toContain("syntax-tone-swatch");
    expect(syntaxDetail).not.toContain("<dt>Tab</dt>");
    expect(syntaxDetail).not.toContain("无有效 profile");
    expect(graphMain).not.toContain("9 点");
    expect(graphMain).not.toContain("7 边");
    expect(graphMain).not.toContain("2 孤立");
    expect(graphDetail).toContain("aria-label=\"图谱统计\"");
    expect(graphDetail).toContain("<dd>9</dd><dt>点</dt>");
    expect(graphDetail).toContain("<dd>7</dd><dt>边</dt>");
    expect(graphDetail).toContain("<dd>2</dd><dt>孤立</dt>");
  });
});
