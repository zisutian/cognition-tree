import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activityControllers } from "../../../presentation/activities/controllers/activityRegistry";
import { createJournalActivitySlots } from "../../../presentation/activities/views/journal/JournalActivitySlots";
import { createNotesActivitySlots } from "../../../presentation/activities/views/notes/NotesActivitySlots";
import { createPlaceholderActivitySlots } from "../../../presentation/activities/views/PlaceholderActivitySlots";
import { createRepositoryActivitySlots } from "../../../presentation/activities/views/repository/RepositoryActivitySlots";
import { createSettingsActivitySlots } from "../../../presentation/activities/views/settings/SettingsActivitySlots";
import { createStructureOperationActivitySlots } from "../../../presentation/activities/views/structure-operation/StructureOperationActivitySlots";
import { createSyntaxActivitySlots } from "../../../presentation/activities/views/syntax/SyntaxActivitySlots";
import { createTodoActivitySlots } from "../../../presentation/activities/views/todo/TodoActivitySlots";
import { createVisualizationActivitySlots } from "../../../presentation/activities/views/visualization/VisualizationActivitySlots";
import {
  activityItems,
  primaryActivityItems,
  utilityActivityItems,
} from "../../../presentation/ui/activityCatalog";
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
import { createWorkspaceShell } from "../fixtures/workspaceShellFixture";

const controls = {
  contextWidth: appContextDefaultWidth,
  focusMode: false,
  onCollapseDetail: () => undefined,
  onConfigureSyntax: () => undefined,
  onContextWidthChange: () => undefined,
  onToggleFocusMode: () => undefined,
};

function renderSlot(slot: React.ReactNode) {
  return renderToStaticMarkup(<>{slot}</>);
}

function createSlots(
  activityId: ActivityId,
  view: TestActivityViews = createActivityViews(),
): ActivitySlots {
  switch (activityId) {
    case "notes":
      return createNotesActivitySlots({
        focusMode: controls.focusMode,
        onCollapseDetail: controls.onCollapseDetail,
        onToggleFocusMode: controls.onToggleFocusMode,
        repositoryName: view.repository.activeRepositoryLabel,
        view: view.notes,
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
    case "structure-operation":
      return createStructureOperationActivitySlots({
        onConfigureSyntax: controls.onConfigureSyntax,
        shell: view.shell,
        view: view.structureOperation,
      });
    case "syntax":
      return createSyntaxActivitySlots({
        onCollapseDetail: controls.onCollapseDetail,
        view: view.syntax,
      });
    case "visualization":
      return createVisualizationActivitySlots({
        ...controls,
        shell: view.shell,
        view: view.visualization,
      });
    case "repository":
      return createRepositoryActivitySlots({
        focusRequest: null,
        onConsumeFocusRequest: () => undefined,
        view: view.repository,
      });
    case "settings":
      return createSettingsActivitySlots({
        workbench: {
          contextWidth: controls.contextWidth,
          onContextWidthChange: controls.onContextWidthChange,
        },
      });
    case "data":
    case "search":
      return createPlaceholderActivitySlots(activityId);
  }
}

describe("activity slots", () => {
  it("maps every Activity to its context and detail shape", () => {
    const expected = [
      ["notes", "Primary", true],
      ["journal", "日记", true],
      ["todo", "代办", true],
      ["structure-operation", "结构操作", false],
      ["visualization", null, true],
      ["syntax", "语法", true],
      ["search", null, false],
      ["data", null, false],
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
    expect(primaryActivityItems.map(({ id, label }) => [id, label])).toEqual([
      ["notes", "笔记"],
      ["journal", "日记"],
      ["todo", "代办"],
      ["structure-operation", "结构操作"],
      ["visualization", "引用图谱"],
      ["syntax", "语法"],
      ["search", "搜索"],
    ]);
    expect(utilityActivityItems.map(({ id, label }) => [id, label])).toEqual([
      ["data", "数据"],
      ["repository", "仓库"],
      ["settings", "设置"],
    ]);
    expect(activityItems.map(({ id }) => id)).toEqual([
      "notes",
      "journal",
      "todo",
      "structure-operation",
      "visualization",
      "syntax",
      "search",
      "data",
      "repository",
      "settings",
    ]);
    expect(activityControllers.map(({ activityId }) => activityId)).toEqual([
      "notes",
      "journal",
      "todo",
      "structure-operation",
      "visualization",
      "syntax",
      "repository",
      "settings",
    ]);
  });

  it("renders every slot and gates parsed Activities without syntax", () => {
    for (const { id } of activityItems) {
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
        },
      }),
      shell: createWorkspaceShell({ hasConfiguredSyntax: false }),
    });

    expect(renderSlot(createSlots("notes", rawViews).main))
      .toContain('data-editor-mode="raw"');
    expect(renderSlot(createSlots("visualization", rawViews).main))
      .toContain("引用图谱不可用");
    expect(renderSlot(createSlots("structure-operation", rawViews).main))
      .toContain("结构操作不可用");
  });
});
