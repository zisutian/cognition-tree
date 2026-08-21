import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  activityDescriptors,
  listActivityDescriptors,
} from "../../../presentation/activities/activityCatalog";
import { createJournalActivitySlots } from "../../../presentation/activities/journal/JournalActivitySlots";
import {
  createNotesActivitySlots,
  createNotesWorkspaceActivitySlots,
  type NotesMode,
} from "../../../presentation/activities/notes/edit/NotesActivitySlots";
import { createRepositoryActivitySlots } from "../../../presentation/activities/repository/RepositoryActivitySlots";
import { createSearchActivitySlots } from "../../../presentation/activities/search/SearchActivitySlots";
import { createSettingsActivitySlots } from "../../../presentation/activities/settings/SettingsActivitySlots";
import { createStructureOperationActivitySlots } from "../../../presentation/activities/notes/structure/StructureOperationActivitySlots";
import { createSyntaxActivitySlots } from "../../../presentation/activities/syntax/SyntaxActivitySlots";
import { createTodoActivitySlots } from "../../../presentation/activities/todo/TodoActivitySlots";
import { createVisualizationActivitySlots } from "../../../presentation/activities/notes/graph/VisualizationActivitySlots";
import type {
  ActivityId,
  ActivitySlots,
} from "../../../presentation/ui/activityTypes";
import {
  appContextDefaultWidth,
} from "../../../presentation/ui/workbench/frameResize";
import {
  createActivityViews,
  type TestActivityViews,
} from "../fixtures/activityViewsFixture";
import { createNotesView } from "../fixtures/notesViewFixture";
import {
  createReferenceGraphSession,
} from "../fixtures/visualizationViewFixture";
import { createWorkspaceShell } from "../fixtures/workspaceShellFixture";
import { createSearchController } from "../../../application/search/searchController";
import { createAgentActivitySlots } from "../../../presentation/activities/agent/AgentActivitySlots";
import { createAgentApplicationFixture } from "../fixtures/agentApplicationFixture";

const controls = {
  contextWidth: appContextDefaultWidth,
  focusMode: false,
  onCollapseDetail: () => undefined,
  onConfigureSyntax: () => undefined,
  onContextWidthChange: () => undefined,
  onToggleFocusMode: () => undefined,
};
const searchController = createSearchController({
  onChange: () => undefined,
  query: {
    async search() {
      return { cursor: null, faults: [], results: [] };
    },
  },
});

function renderSlot(slot: React.ReactNode) {
  return renderToStaticMarkup(<>{slot}</>);
}

function createSlots(
  activityId: ActivityId,
  view: TestActivityViews = createActivityViews(),
  notesMode: NotesMode = "edit",
): ActivitySlots {
  switch (activityId) {
    case "agent":
      return createAgentActivitySlots({
        agent: createAgentApplicationFixture(),
        creatingSession: false,
        onBeginCreateSession: () => undefined,
        onCollapseDetail: controls.onCollapseDetail,
        onSelectSession: () => undefined,
      });
    case "notes":
      return createNotesWorkspaceActivitySlots({
        edit: createNotesActivitySlots({
          focusMode: controls.focusMode,
          onCollapseDetail: controls.onCollapseDetail,
          onToggleFocusMode: controls.onToggleFocusMode,
          repositoryName: view.repository.activeRepositoryLabel,
          view: view.notes,
        }),
        graph: createVisualizationActivitySlots({
          ...controls,
          session: createReferenceGraphSession(),
          shell: view.shell,
          view: view.visualization,
        }),
        mode: notesMode,
        onModeChange: () => undefined,
        repositoryName: view.repository.activeRepositoryLabel,
        structure: createStructureOperationActivitySlots({
          onConfigureSyntax: controls.onConfigureSyntax,
          shell: view.shell,
          view: view.structureOperation,
        }),
      });
    case "journal":
      return createJournalActivitySlots({
        focusMode: controls.focusMode,
        onCollapseDetail: controls.onCollapseDetail,
        onToggleFocusMode: controls.onToggleFocusMode,
        view: view.journal,
      });
    case "todo":
      return createTodoActivitySlots({
        focusMode: controls.focusMode,
        onCollapseDetail: controls.onCollapseDetail,
        onToggleFocusMode: controls.onToggleFocusMode,
        view: view.todo,
      });
    case "syntax":
      return createSyntaxActivitySlots({
        onCollapseDetail: controls.onCollapseDetail,
        view: view.syntax,
      });
    case "repository":
      return createRepositoryActivitySlots({
        focusRequest: null,
        onConsumeFocusRequest: () => undefined,
        view: view.repository,
      });
    case "settings":
      return createSettingsActivitySlots({
        agent: createAgentApplicationFixture(),
        apiAccess: {
          administration: {} as Parameters<
            typeof createSettingsActivitySlots
          >[0]["apiAccess"]["administration"],
          repositories: [],
        },
        workbench: {
          contextWidth: controls.contextWidth,
          onContextWidthChange: controls.onContextWidthChange,
        },
      });
    case "search":
      return createSearchActivitySlots({
        catalogStatus: "ready",
        controller: searchController,
        onOpenResult: () => undefined,
        repositories: [],
        state: searchController.getState(),
      });
  }
}

describe("activity slots", () => {
  it("maps every Activity to its context and detail shape", () => {
    const expected = [
      ["agent", "Agent", true],
      ["notes", "Primary", true],
      ["journal", "日记", true],
      ["todo", "代办", true],
      ["syntax", "语法", true],
      ["search", "搜索", false],
      ["repository", "仓库", false],
      ["settings", "设置", false],
    ] as const satisfies ReadonlyArray<
      readonly [ActivityId, string | null, boolean]
    >;

    expect(expected.map(([activityId]) => {
      const slots = createSlots(activityId);

      return [
        activityId,
        slots.context?.title ?? null,
        slots.detail !== null,
      ] as const;
    })).toEqual(expected);
  });

  it("keeps catalog and lazy-controller order aligned", () => {
    expect(
      listActivityDescriptors("primary").map(({ id, label }) => [id, label]),
    ).toEqual([
      ["agent", "Agent"],
      ["notes", "笔记"],
      ["journal", "日记"],
      ["todo", "代办"],
      ["syntax", "语法"],
      ["search", "搜索"],
    ]);
    expect(
      listActivityDescriptors("management").map(({ id, label }) => [id, label]),
    ).toEqual([
      ["repository", "仓库"],
      ["settings", "设置"],
    ]);
    expect(activityDescriptors.map(({ id }) => id)).toEqual([
      "agent",
      "notes",
      "journal",
      "todo",
      "syntax",
      "search",
      "repository",
      "settings",
    ]);
    expect(activityDescriptors.map(({ id, group, availability }) => [
      id,
      group,
      availability,
    ])).toEqual([
      ["agent", "primary", "always"],
      ["notes", "primary", "workspace"],
      ["journal", "primary", "always"],
      ["todo", "primary", "always"],
      ["syntax", "primary", "always"],
      ["search", "primary", "always"],
      ["repository", "management", "always"],
      ["settings", "management", "always"],
    ]);
  });

  it("renders every slot and gates parsed Activities without syntax", () => {
    for (const { id } of activityDescriptors) {
      const slots = createSlots(id);

      expect(renderSlot(slots.main).length).toBeGreaterThan(0);
      if (slots.context) {
        expect(renderSlot(slots.context.content).length).toBeGreaterThan(0);
      }
      if (slots.detail) {
        expect(renderSlot(slots.detail).length).toBeGreaterThan(0);
      }
    }

    const rawViews = createActivityViews({
      notes: createNotesView({
        editor: {
          ...createNotesView().editor,
          mode: "raw",
          syntax: null,
        },
      }),
      shell: createWorkspaceShell({ hasConfiguredSyntax: false }),
    });

    expect(renderSlot(createSlots("notes", rawViews).main))
      .toContain('data-editor-mode="raw"');
    const rawGraphSlots = createSlots("notes", rawViews, "graph");

    expect(renderSlot(rawGraphSlots.main))
      .toContain("引用图谱不可用");
    expect(rawGraphSlots.context?.title).toBe("Primary");
    expect(renderSlot(rawGraphSlots.context?.content)).toContain(
      'role="group"',
    );
    expect(renderSlot(rawGraphSlots.context?.content)).not.toContain(
      'aria-label="图谱控制"',
    );
    expect(renderSlot(createSlots("notes", rawViews, "structure").main))
      .toContain("结构操作不可用");
    const noteModeSlots = (["edit", "structure", "graph"] as const).map(
      (mode) => createSlots("notes", undefined, mode),
    );
    const notesContextMarkup = renderSlot(
      noteModeSlots[0]?.context?.content,
    );

    expect(noteModeSlots.map(({ context }) => context?.title)).toEqual([
      "Primary",
      "Primary",
      "Primary",
    ]);
    expect(notesContextMarkup).toContain('aria-label="笔记视图"');
    expect(notesContextMarkup).toContain('aria-pressed="true"');
    expect(renderSlot(noteModeSlots[0]?.main)).not.toContain(
      'aria-label="笔记视图"',
    );
    expect(renderSlot(noteModeSlots[1]?.context?.content))
      .toContain("结构操作模式");
    expect(renderSlot(noteModeSlots[2]?.context?.content))
      .toContain('aria-label="图谱控制"');
    expect(renderSlot(noteModeSlots[2]?.main))
      .not.toContain('aria-label="图谱控制"');

    const submitted = {
      domains: ["workspace", "journal", "todo"] as const,
      query: "共同词",
      repositoryIds: null,
      updatedAfter: null,
    };
    const resultBase = {
      domain: "workspace" as const,
      repositoryId: "repository-a",
      resourceId: "note-a",
      title: "Alpha",
      updatedAt: "2026-07-29T10:00:00.000Z",
      version:
        `sha256:${"a".repeat(64)}` as `sha256:${string}`,
    };
    const searchSlots = createSearchActivitySlots({
      catalogStatus: "ready",
      controller: searchController,
      onOpenResult: () => undefined,
      repositories: [{ id: "repository-a", label: "仓库 A" }],
      state: {
        ...searchController.getState(),
        draft: {
          ...submitted,
          domains: [...submitted.domains],
        },
        faults: [{
          code: "source_unavailable",
          domain: "journal",
          message: "暂时不可用",
        }],
        results: [
          {
            ...resultBase,
            blockId: null,
            snippet: "整篇共同词",
          },
          {
            ...resultBase,
            blockId: "block-a",
            snippet: "块内共同词",
          },
        ],
        status: "ready",
        submitted: {
          ...submitted,
          domains: [...submitted.domains],
        },
      },
    });
    const searchContext = renderSlot(searchSlots.context?.content);
    const searchMain = renderSlot(searchSlots.main);

    expect(searchContext).toContain('role="search"');
    expect(searchContext).toContain('type="datetime-local"');
    expect(searchContext).toContain("仓库 A");
    expect(searchMain).toContain("部分来源不可用");
    expect(searchMain).toContain("块内共同词");
    expect(searchMain).not.toContain("整篇共同词");

    const renderSearchState = (
      override: Partial<ReturnType<typeof searchController.getState>>,
    ) =>
      renderSlot(createSearchActivitySlots({
        catalogStatus: "ready",
        controller: searchController,
        onOpenResult: () => undefined,
        repositories: [{ id: "repository-a", label: "仓库 A" }],
        state: {
          ...searchController.getState(),
          status: "ready",
          submitted: {
            ...submitted,
            domains: [...submitted.domains],
          },
          ...override,
        },
      }).main);
    const statusScenarios: Array<
      [Parameters<typeof renderSearchState>[0], string]
    > = [
      [{ status: "loading" }, "正在搜索"],
      [{ results: [] }, "没有结果"],
      [{
        errorMessage: "无法执行搜索",
        results: [],
      }, "搜索失败"],
      [{
        faults: [{
          code: "source_unavailable",
          domain: "todo",
          message: "暂时不可用",
        }],
        results: [],
      }, "搜索来源不可用"],
      [{
        errorMessage: "搜索来源已更新，请重新搜索。",
        results: [{
          ...resultBase,
          blockId: "block-a",
          snippet: "保留旧结果",
        }],
      }, "搜索来源已更新，请重新搜索。"],
    ];

    for (const [state, expectedText] of statusScenarios) {
      expect(renderSearchState(state)).toContain(expectedText);
    }
  });

  it("keeps Agent sessions in context and new-session scope in main", () => {
    const slots = createAgentActivitySlots({
      agent: createAgentApplicationFixture(),
      creatingSession: true,
      onBeginCreateSession: () => undefined,
      onCollapseDetail: controls.onCollapseDetail,
      onSelectSession: () => undefined,
    });
    const contextMarkup = renderSlot(slots.context?.content);
    const mainMarkup = renderSlot(slots.main);

    expect(contextMarkup).toContain('aria-label="新建会话"');
    expect(contextMarkup).toContain('aria-label="Agent 会话"');
    expect(contextMarkup).not.toContain('aria-label="领域"');
    expect(mainMarkup).toContain('aria-label="新建 Agent 会话"');
    expect(mainMarkup).toContain(">领域<");
    expect(mainMarkup).toContain(">硬范围<");
    expect(mainMarkup).toContain("请先在设置中选择");
  });
});
