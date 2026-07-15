import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppFrame } from "../../src/ui/AppFrame";

const { readFileSync } = (await import("node:fs")) as {
  readFileSync: (path: URL, encoding: "utf8") => string;
};
const frameCss = readFileSync(
  new URL("../../src/ui/styles/frame/frame.css", import.meta.url),
  "utf8",
);

describe("AppFrame", () => {
  function renderFrame({
    context = true,
    detail = false,
    detailCollapsed = false,
    focusMode = false,
  } = {}) {
    return renderToStaticMarkup(
      <AppFrame
        activeActivityId="notes"
        contextSlot={context ? { content: <div>context</div>, title: "笔记" } : null}
        detailSlot={detail ? <section className="ui-panel">detail</section> : null}
        layout={{
          contextCollapsed: false,
          contextResizeValue: 280,
          contextWidth: 280,
          detailCollapsed,
          detailResizeValue: 320,
          detailWidth: 320,
          focusMode,
          isContextResizing: false,
          isDetailResizing: false,
          onContextResizeKeyDown: () => undefined,
          onContextResizeStart: () => undefined,
          onDetailResizeKeyDown: () => undefined,
          onDetailResizeStart: () => undefined,
          onDetailToggle: () => undefined,
        }}
        mainSlot={<section className="ui-panel">main</section>}
        onActivityChange={() => undefined}
      />,
    );
  }

  it("does not render an empty context panel for context-free pages", () => {
    const markup = renderFrame({ context: false });

    expect(markup).toContain("activity-bar");
    expect(markup).toContain("no-context");
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

  it("keeps only the activity bar and main slot in focus mode", () => {
    const markup = renderFrame({ detail: true, focusMode: true });

    expect(markup).toContain("is-focus-mode");
    expect(markup).toContain("activity-bar");
    expect(markup).toContain("main");
    expect(markup).not.toContain('class="app-context"');
    expect(markup).not.toContain('class="app-detail');
  });

  it("reduces collapsed detail to the compact row on narrow screens", () => {
    const responsiveStart = frameCss.indexOf("@media (max-width: 1120px)");
    const responsiveSource = frameCss.slice(responsiveStart);

    expect(responsiveSource).toContain(".app-frame.detail-collapsed");
    expect(responsiveSource).toContain("var(--app-detail-collapsed-width)");
    expect(responsiveSource).toContain(
      ".app-frame.no-context.detail-collapsed",
    );
    expect(responsiveSource).toContain(".app-detail-collapsed");
    expect(responsiveSource).toContain("border-left: 0");
  });
});
