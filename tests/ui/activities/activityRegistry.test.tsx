import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createActivitySlots,
} from "../../../src/ui/activities/activityRegistry";
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

describe("activity registry", () => {
  it("maps each activity to explicit slots", () => {
    expect(slots("notes").context?.title).toBe("笔记");
    expect(slots("notes").detail).not.toBeNull();
    expect(slots("notes").mainSpan).toBe("standard");

    expect(slots("migration").context?.title).toBe("块迁移");
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
    const migrationSlots = slots("migration");
    const context = renderSlot(migrationSlots.context?.content);
    const main = renderSlot(migrationSlots.main);

    expect(context).toContain("Source note");
    expect(context).toContain("Target note");
    expect(context).toContain("点选源");
    expect(context).toContain("当前源");
    expect(context).toContain("源和目标");
    expect(context).toContain("结构");
    expect(context).toContain("目标");
    expect(context).not.toContain("ui-tree-actions");
    expect(main).toContain("块迁移");
    expect(main).toContain("源 · Source note");
    expect(main).toContain("目标 · Target note");
  });
});
