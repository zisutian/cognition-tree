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
        },
      }),
    );
    const context = renderSlot(migrationSlots.context?.content);
    const main = renderSlot(migrationSlots.main);

    expect(context).toContain("Source note");
    expect(context).toContain("Target note");
    expect(context).toContain("Neutral note");
    expect(context).toContain("点选源笔记");
    expect(context).toContain("当前源笔记");
    expect(context).toContain("源笔记 / 目标笔记");
    expect(context).toContain("笔记结构");
    expect(context).toContain("目标笔记");
    expect(context).toContain("draggable=\"true\"");
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
    expect(main).not.toContain("源块");
    expect(main).not.toContain("目标块");
    expect(main).not.toContain("结构块");
  });

  it("renders only structure status in structure operation mode", () => {
    const baseView = createView();
    const migrationSlots = slotsWithView(
      "migration",
      createView({
        migration: {
          ...baseView.migration,
          mode: "structure",
        },
      }),
    );
    const context = renderSlot(migrationSlots.context?.content);

    expect(context).toContain("点选笔记结构");
    expect(context).toContain("lucide-git-branch");
    expect(context).not.toContain("lucide-file-output");
    expect(context).not.toContain("lucide-file-input");
  });
});
