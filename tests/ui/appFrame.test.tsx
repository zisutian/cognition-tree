import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppFrame } from "../../src/ui/AppFrame";

describe("AppFrame", () => {
  function renderFrame({
    context = true,
    detail = false,
    detailCollapsed = false,
    span = "standard" as "full" | "standard",
  } = {}) {
    return renderToStaticMarkup(
      <AppFrame
        activeActivityId="notes"
        contextCollapsed={false}
        contextResizeValue={280}
        contextSlot={context ? { content: <div>context</div>, title: "笔记" } : null}
        contextWidth={280}
        detailCollapsed={detailCollapsed}
        detailResizeValue={320}
        detailSlot={detail ? <aside className="ui-panel">detail</aside> : null}
        detailWidth={320}
        isContextResizing={false}
        isDetailResizing={false}
        mainSlot={<section className="ui-panel">main</section>}
        mainSpan={span}
        onActivityChange={() => undefined}
        onContextResizeKeyDown={() => undefined}
        onContextResizeStart={() => undefined}
        onDetailResizeKeyDown={() => undefined}
        onDetailResizeStart={() => undefined}
        onDetailToggle={() => undefined}
      />,
    );
  }

  it("does not render an empty context panel for context-free pages", () => {
    const markup = renderFrame({ context: false, span: "full" });

    expect(markup).toContain("activity-bar");
    expect(markup).toContain("no-context");
    expect(markup).toContain("main-full");
    expect(markup).not.toContain("app-context-header");
    expect(markup).not.toContain("调整上下文区宽度");
  });

  it("renders context and detail resize affordances when slots exist", () => {
    const markup = renderFrame({ detail: true });

    expect(markup).toContain("--app-context-width:280px");
    expect(markup).toContain("--app-detail-width:320px");
    expect(markup).toContain("调整上下文区宽度");
    expect(markup).toContain("调整右侧详情宽度");
  });

  it("keeps a collapsed detail opener in its header", () => {
    const markup = renderFrame({ detail: true, detailCollapsed: true });

    expect(markup).toContain("app-detail-collapsed-header");
    expect(markup).toContain("app-detail-toggle");
    expect(markup).toContain("展开右侧详情");
    expect(markup).not.toContain("detail</aside>");
  });
});
