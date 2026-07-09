import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createActivitySlots,
} from "../../../src/ui/activities/activityRegistry";
import { activityItems } from "../../../src/ui/ActivityBar";
import type { ActivityId } from "../../../src/ui/activityTypes";
import { createView } from "../viewFactory";

function renderSlot(slot: React.ReactNode) {
  return renderToStaticMarkup(<>{slot}</>);
}

function slots(activityId: ActivityId) {
  return createActivitySlots({
    activityId,
    onCollapseDetail: () => undefined,
    onConfigureSyntax: () => undefined,
    view: createView(),
  });
}

function slotsWithView(activityId: ActivityId, view = createView()) {
  return createActivitySlots({
    activityId,
    onCollapseDetail: () => undefined,
    onConfigureSyntax: () => undefined,
    view,
  });
}

describe("activity registry", () => {
  it("maps each activity to explicit slots", () => {
    expect(slots("notes").context?.title).toBe("笔记");
    expect(slots("notes").detail).not.toBeNull();
    expect(slots("notes").mainSpan).toBe("standard");

    expect(slots("migration").context?.title).toBe("结构操作");
    expect(slots("migration").detail).toBeNull();
    expect(slots("migration").mainSpan).toBe("full");

    expect(slots("syntax").context).toBeNull();
    expect(slots("syntax").detail).not.toBeNull();
    expect(slots("syntax").mainSpan).toBe("standard");

    expect(slots("visualization").context).toBeNull();
    expect(slots("visualization").detail).not.toBeNull();
    expect(slots("visualization").mainSpan).toBe("standard");

    expect(slots("search").context).toBeNull();
    expect(slots("search").mainSpan).toBe("full");
    expect(slots("data").context).toBeNull();
    expect(slots("settings").context).toBeNull();
  });

  it("uses structure operation label in the activity bar", () => {
    expect(activityItems.find((item) => item.id === "migration")?.label).toBe(
      "结构操作",
    );
  });

  it("uses syntax setup for syntax-dependent activities before configuration", () => {
    const view = createView({ hasConfiguredSyntax: false });

    expect(
      renderSlot(
        createActivitySlots({
          activityId: "notes",
          onCollapseDetail: () => undefined,
          onConfigureSyntax: () => undefined,
          view,
        }).main,
      ),
    ).toContain("仓库语法未配置");
    expect(
      renderSlot(
        createActivitySlots({
          activityId: "visualization",
          onCollapseDetail: () => undefined,
          onConfigureSyntax: () => undefined,
          view,
        }).main,
      ),
    ).toContain("仓库语法未配置");
  });

  it("renders placeholders and settings without a directory context", () => {
    expect(renderSlot(slots("search").main)).toContain("搜索功能待接入");
    expect(renderSlot(slots("data").main)).toContain("数据功能待接入");
    expect(renderSlot(slots("settings").main)).toContain("/workspace");
  });

  it("renders migration context and full-width main work surface", () => {
    const baseView = createView();
    const migrationSlots = slotsWithView(
      "migration",
      createView({
        editor: {
          ...baseView.editor,
          syntaxProfile: {
            ...baseView.editor.syntaxProfile,
            tabDisplayWidth: 7,
          },
        },
        migration: {
          ...baseView.migration,
          noteTree: [
            ...baseView.migration.noteTree,
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
                  level: 1,
                  lineLabel: "L2",
                  lineNumber: 2,
                  textDisplay: {
                    displayText: "源子块",
                    segments: [{ id: "text", kind: "text", text: "源子块" }],
                    textColorClassName: "block-text-default",
                  },
                },
              ],
              hasDiagnostics: false,
              id: "source-block-1",
              label: "组分",
              level: 0,
              lineLabel: "L1",
              lineNumber: 1,
              textDisplay: {
                displayText: "源内容",
                segments: [{ id: "text", kind: "text", text: "源内容" }],
                textColorClassName: "block-text-default",
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
                  level: 1,
                  lineLabel: "L12",
                  lineNumber: 12,
                  textDisplay: {
                    displayText: "目标子块",
                    segments: [
                      { id: "text", kind: "text", text: "目标子块" },
                    ],
                    textColorClassName: "block-text-default",
                  },
                },
              ],
              hasDiagnostics: false,
              id: "target-block-11",
              label: "理解",
              level: 0,
              lineLabel: "L11",
              lineNumber: 11,
              textDisplay: {
                displayText: "目标内容",
                segments: [{ id: "text", kind: "text", text: "目标内容" }],
                textColorClassName: "block-text-default",
              },
            },
          ],
        },
      }),
    );
    const context = renderSlot(migrationSlots.context?.content);
    const main = renderSlot(migrationSlots.main);

    expect(context).toContain("Source note");
    expect(context).toContain("Target note");
    expect(context).toContain("Neutral note");
    expect(context).toContain("源笔记 / 目标笔记");
    expect(context).toContain("笔记结构");
    expect(context).toContain("ui-segmented-control");
    expect(context).not.toContain("context-caption");
    expect(context).not.toContain("点选源笔记");
    expect(context).not.toContain("当前源笔记");
    expect(context).not.toContain("migration-mode-switch");
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
    expect(main).toContain("ui-tree ui-structure-tree migration-target-tree");
    expect(main).toContain("data-structure-row-drop=\"true\"");
    expect(main).toContain("--ui-structure-depth:1");
    expect(main).toContain("--ui-structure-indent-width:24.5px");
    expect(main).not.toContain("源块");
    expect(main).not.toContain("目标块");
    expect(main).not.toContain("结构块");
  });

  it("renders only structure status in structure operation mode", () => {
    const baseView = createView();
    const migrationSlots = slotsWithView(
      "migration",
      createView({
        editor: {
          ...baseView.editor,
          syntaxProfile: {
            ...baseView.editor.syntaxProfile,
            tabDisplayWidth: 5,
          },
        },
        migration: {
          ...baseView.migration,
          mode: "structure",
          structureRoots: [
            {
              children: [
                {
                  children: [],
                  hasDiagnostics: false,
                  id: "structure-block-2",
                  label: "顶格概念",
                  level: 1,
                  lineLabel: "L2",
                  lineNumber: 2,
                  textDisplay: {
                    displayText: "结构子项",
                    segments: [
                      { id: "text", kind: "text", text: "结构子项" },
                    ],
                    textColorClassName: "block-text-default",
                  },
                },
              ],
              hasDiagnostics: false,
              id: "structure-block-1",
              label: "组分",
              level: 0,
              lineLabel: "L1",
              lineNumber: 1,
              textDisplay: {
                displayText: "结构项",
                segments: [{ id: "text", kind: "text", text: "结构项" }],
                textColorClassName: "block-text-default",
              },
            },
          ],
        },
      }),
    );
    const context = renderSlot(migrationSlots.context?.content);
    const main = renderSlot(migrationSlots.main);

    expect(context).toContain("ui-symbol-slot");
    expect(context).toContain("ui-tree-status");
    expect(context).toContain("lucide-git-branch");
    expect(context).not.toContain("context-caption");
    expect(context).not.toContain("点选笔记结构");
    expect(context).not.toContain("lucide-file-output");
    expect(context).not.toContain("lucide-file-input");
    expect(main).toContain("ui-tree ui-structure-tree migration-target-tree");
    expect(main).toContain("data-structure-row-drop=\"true\"");
    expect(main).toContain("--ui-structure-depth:1");
    expect(main).toContain("--ui-structure-indent-width:17.5px");
  });
});
