import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppFrame } from "../../src/ui/AppFrame";

describe("AppFrame", () => {
  function renderFrame({
    context = true,
    detail = false,
    detailCollapsed = false,
    focusMode = false,
    problems = true,
    problemsExpanded = false,
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
          isProblemsResizing: false,
          onContextResizeKeyDown: () => undefined,
          onContextResizeStart: () => undefined,
          onDetailResizeKeyDown: () => undefined,
          onDetailResizeStart: () => undefined,
          onDetailToggle: () => undefined,
          onProblemsResizeKeyDown: () => undefined,
          onProblemsResizeStart: () => undefined,
          problemsExpanded,
          problemsHeight: 200,
          problemsResizeValue: 200,
        }}
        mainSlot={<section className="ui-panel">main</section>}
        onActivityChange={() => undefined}
        problemsSlot={problems ? <div>problems</div> : null}
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
    expect(markup).not.toContain('class="app-problems');
  });

  it("keeps the global problems panel collapsed without a resize handle", () => {
    const markup = renderFrame();

    expect(markup).toContain("app-main-content");
    expect(markup).toContain("app-problems");
    expect(markup).toContain("problems");
    expect(markup).not.toContain("调整问题面板高度");
  });

  it("renders an accessible height separator only while problems are expanded", () => {
    const markup = renderFrame({ problemsExpanded: true });

    expect(markup).toContain("problems-expanded");
    expect(markup).toContain("app-problems is-expanded");
    expect(markup).toContain("调整问题面板高度");
    expect(markup).toContain('aria-valuemin="120"');
    expect(markup).toContain('aria-valuemax="360"');
    expect(markup).toContain("--app-problems-height:200px");
  });

  it("does not reserve a bottom region when no global panel is supplied", () => {
    const markup = renderFrame({ problems: false });

    expect(markup).not.toContain("has-problems");
    expect(markup).not.toContain('class="app-problems');
  });

});
