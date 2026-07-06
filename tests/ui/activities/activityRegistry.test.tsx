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
      noteTree: [],
      notes: [],
      onMoveBlockToPosition: () => undefined,
      onSourceNoteChange: () => undefined,
      onTargetNoteChange: () => undefined,
      sourceBlocks: [],
      sourceNote: null,
      sourceNoteId: "",
      sourceRoots: [],
      targetNote: null,
      targetNoteId: "",
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
    selectFolder: () => undefined,
    selectNote: () => undefined,
    sidebar: {
      activeFolderId: "folder-inbox",
      activeNoteFolderId: "folder-inbox",
      activeNoteId: "note-1",
      defaultFolderId: "folder-inbox",
      folderCount: 1,
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
      },
      protectedInlineRuleIds: [],
    },
    updateActiveNoteSource: () => undefined,
    useDefaultSyntax: () => undefined,
    visualization: {
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
    errorMessage: "",
    ...overrides,
  };
}

function createSlots(activityId: ActivityId, view = createView()) {
  return createActivitySlots({
    activityId,
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
});
