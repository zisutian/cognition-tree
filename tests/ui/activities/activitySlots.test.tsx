import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createNotesActivitySlots } from "../../../src/ui/activities/notes/NotesActivitySlots";
import { createPlaceholderActivitySlots } from "../../../src/ui/activities/PlaceholderActivitySlots";
import { createSettingsActivitySlots } from "../../../src/ui/activities/settings/SettingsActivitySlots";
import { createStructureOperationActivitySlots } from "../../../src/ui/activities/structure-operation/StructureOperationActivitySlots";
import { createSyntaxActivitySlots } from "../../../src/ui/activities/syntax/SyntaxActivitySlots";
import { createVisualizationActivitySlots } from "../../../src/ui/activities/visualization/VisualizationActivitySlots";
import { activityItems } from "../../../src/ui/ActivityBar";
import type { ActivityId } from "../../../src/ui/activityTypes";
import { createView, type TestActivityViews } from "../viewFactory";

function renderSlot(slot: React.ReactNode) {
  return renderToStaticMarkup(<>{slot}</>);
}

function slots(activityId: ActivityId) {
  return slotsWithView(activityId, createView());
}

function slotsWithView(
  activityId: ActivityId,
  view: TestActivityViews,
) {
  const controls = {
    onCollapseDetail: () => undefined,
    onConfigureSyntax: () => undefined,
  };

  switch (activityId) {
    case "notes":
      return createNotesActivitySlots({
        onCollapseDetail: controls.onCollapseDetail,
        view: view.notes,
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
    case "settings":
      return createSettingsActivitySlots(view.settings);
    case "data":
    case "search":
      return createPlaceholderActivitySlots(activityId);
  }
}

describe("activity slots", () => {
  it("maps each activity to explicit slots", () => {
    expect(slots("notes").context?.title).toBe("笔记");
    expect(slots("notes").detail).not.toBeNull();

    expect(slots("structure-operation").context?.title).toBe("结构操作");
    expect(slots("structure-operation").detail).toBeNull();

    expect(slots("syntax").context).toBeNull();
    expect(slots("syntax").detail).not.toBeNull();

    expect(slots("visualization").context).toBeNull();
    expect(slots("visualization").detail).not.toBeNull();

    expect(slots("search").context).toBeNull();
    expect(slots("data").context).toBeNull();
    expect(slots("settings").context).toBeNull();
  });

  it("uses structure operation label in the activity bar", () => {
    expect(activityItems.map((item) => item.id)).toEqual([
      "notes",
      "structure-operation",
      "visualization",
      "syntax",
      "search",
      "data",
      "settings",
    ]);
    expect(
      activityItems.find((item) => item.id === "structure-operation")?.label,
    ).toBe("结构操作");
    expect(
      activityItems.find((item) => item.id === "visualization")?.label,
    ).toBe("引用图谱");
  });

  it("keeps raw notes editable and gates parsed activities without syntax", () => {
    const baseView = createView();
    const view = createView({
      notes: {
        ...baseView.notes,
        editor: {
          ...baseView.notes.editor,
          hasParsedDocument: false,
          mode: "raw",
        },
      },
      shell: { ...baseView.shell, hasConfiguredSyntax: false },
    });

    const noteMarkup = renderSlot(slotsWithView("notes", view).main);

    expect(noteMarkup).toContain("data-editor-mode=\"raw\"");
    expect(noteMarkup).not.toContain("仓库语法未配置");
    expect(
      renderSlot(
        slotsWithView("visualization", view).main,
      ),
    ).toContain("引用图谱不可用");
    expect(
      renderSlot(
        slotsWithView("structure-operation", view).main,
      ),
    ).toContain("结构操作不可用");
  });

  it("renders placeholders and settings without a directory context", () => {
    expect(renderSlot(slots("search").main)).toContain("搜索功能待接入");
    expect(renderSlot(slots("data").main)).toContain("数据功能待接入");
    expect(renderSlot(slots("settings").main)).toContain("/workspace");
  });

  it("shows repository conflict recovery only when local changes are blocked", () => {
    const baseView = createView();
    const conflictMarkup = renderSlot(
      slotsWithView(
        "settings",
        createView({
          settings: {
            ...baseView.settings,
            hasSaveConflict: true,
            saveStatusLabel: "仓库内容已更改",
          },
        }),
      ).main,
    );

    expect(conflictMarkup).toContain("仓库内容已更改");
    expect(conflictMarkup).toContain("放弃本地修改并重新加载");
    expect(renderSlot(slots("settings").main)).not.toContain(
      "放弃本地修改并重新加载",
    );
  });

  it("renders structure operation context and full-width main work surface", () => {
    const baseView = createView();
    const structureOperationSlots = slotsWithView(
      "structure-operation",
      createView({
        structureOperation: {
          ...baseView.structureOperation,
          indentUnitCount: 7,
          noteTree: [
            ...baseView.structureOperation.noteTree,
            {
              canDrag: true,
              folderId: null,
              id: "neutral-node",
              kind: "note",
              noteId: "note-neutral",
              parentFolderId: null,
              title: "Neutral note",
            },
          ],
          sourceRoots: [
            {
              children: [
                {
                  children: [],
                  hasDiagnostics: false,
                  id: "source-block-2",
                  label: "定义",
                  lineLabel: "L2",
                  lineNumber: 2,
                  textDisplay: {
                    displayText: "源子块",
                    segments: [{ id: "text", kind: "text", text: "源子块" }],
                    textColor: "default",
                  },
                },
              ],
              hasDiagnostics: false,
              id: "source-block-1",
              label: "组分",
              lineLabel: "L1",
              lineNumber: 1,
              textDisplay: {
                displayText: "源内容",
                segments: [{ id: "text", kind: "text", text: "源内容" }],
                textColor: "default",
              },
            },
          ],
          targetRoots: [
            {
              children: [
                {
                  children: [],
                  hasDiagnostics: false,
                  id: "target-block-12",
                  label: "定义",
                  lineLabel: "L12",
                  lineNumber: 12,
                  textDisplay: {
                    displayText: "目标子块",
                    segments: [
                      { id: "text", kind: "text", text: "目标子块" },
                    ],
                    textColor: "default",
                  },
                },
              ],
              hasDiagnostics: false,
              id: "target-block-11",
              label: "理解",
              lineLabel: "L11",
              lineNumber: 11,
              textDisplay: {
                displayText: "目标内容",
                segments: [{ id: "text", kind: "text", text: "目标内容" }],
                textColor: "default",
              },
            },
          ],
        },
      }),
    );
    const context = renderSlot(structureOperationSlots.context?.content);
    const main = renderSlot(structureOperationSlots.main);

    expect(context).toContain("Source note");
    expect(context).toContain("Target note");
    expect(context).toContain("Neutral note");
    expect(context).toContain("源笔记 / 目标笔记");
    expect(context).toContain("笔记结构");
    expect(context).toContain("aria-label=\"结构操作模式\"");
    expect(context).not.toContain("迁移模式");
    expect(context).toContain("ui-segmented-control");
    expect(context).not.toContain("context-caption");
    expect(context).not.toContain("点选源笔记");
    expect(context).not.toContain("当前源笔记");
    expect(context).toContain("目标笔记");
    expect(context).toContain("draggable=\"true\"");
    expect(context).toContain("ui-symbol-slot");
    expect(context).toContain("ui-tree-status");
    expect(context).toContain("ui-tree-actions");
    expect(context).toContain("lucide-file-output");
    expect(context).toContain("lucide-file-input");
    expect(context).toContain(">改<");
    expect(context).toContain(">删<");
    expect(context).not.toContain("lucide-git-branch");
    expect(context).toContain("lucide-file-text");
    expect(main).toContain("结构操作");
    expect(main).toContain("源笔记 · Source note");
    expect(main).toContain("目标笔记 · Target note");
    expect(main).toContain("aria-label=\"交换源笔记和目标笔记\"");
    expect(main).toContain("lucide-arrow-left-right");
    expect(main).toContain(
      "ui-tree ui-structure-tree structure-operation-target-tree",
    );
    expect(main).toContain("data-structure-row-drop=\"true\"");
    expect(main).toContain("--ui-structure-depth:1");
    expect(main).toContain("--ui-structure-indent-width:24.5px");
    expect(main).not.toContain("源块");
    expect(main).not.toContain("目标块");
    expect(main).not.toContain("结构块");
  });

  it("renders only structure status in structure operation mode", () => {
    const baseView = createView();
    const structureOperationSlots = slotsWithView(
      "structure-operation",
      createView({
        structureOperation: {
          ...baseView.structureOperation,
          indentUnitCount: 5,
          mode: "withinNote",
          structureRoots: [
            {
              children: [
                {
                  children: [],
                  hasDiagnostics: false,
                  id: "structure-block-2",
                  label: "顶格概念",
                  lineLabel: "L2",
                  lineNumber: 2,
                  textDisplay: {
                    displayText: "结构子项",
                    segments: [
                      { id: "text", kind: "text", text: "结构子项" },
                    ],
                    textColor: "default",
                  },
                },
              ],
              hasDiagnostics: false,
              id: "structure-block-1",
              label: "组分",
              lineLabel: "L1",
              lineNumber: 1,
              textDisplay: {
                displayText: "结构项",
                segments: [{ id: "text", kind: "text", text: "结构项" }],
                textColor: "default",
              },
            },
          ],
        },
      }),
    );
    const context = renderSlot(structureOperationSlots.context?.content);
    const main = renderSlot(structureOperationSlots.main);

    expect(context).toContain("ui-symbol-slot");
    expect(context).toContain("ui-tree-status");
    expect(context).toContain("lucide-git-branch");
    expect(context).not.toContain("context-caption");
    expect(context).not.toContain("点选笔记结构");
    expect(context).not.toContain("lucide-file-output");
    expect(context).not.toContain("lucide-file-input");
    expect(context).toContain("draggable=\"true\"");
    expect(main).toContain(
      "ui-tree ui-structure-tree structure-operation-target-tree",
    );
    expect(main).toContain("data-structure-row-drop=\"true\"");
    expect(main).toContain("--ui-structure-depth:1");
    expect(main).toContain("--ui-structure-indent-width:17.5px");
  });
});
