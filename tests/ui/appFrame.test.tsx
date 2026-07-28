import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppFrame } from "../../presentation/ui/AppFrame";
import {
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsDefaultHeight,
  appProblemsMaxHeight,
  appProblemsMinHeight,
} from "../../presentation/ui/workbench/frameResize";

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
        detailSlot={detail ? <section>detail</section> : null}
        layout={{
          contextCollapsed: false,
          contextResizeValue: appContextDefaultWidth,
          contextWidth: appContextDefaultWidth,
          detailCollapsed,
          detailResizeValue: appDetailDefaultWidth,
          detailWidth: appDetailDefaultWidth,
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
          problemsHeight: appProblemsDefaultHeight,
          problemsResizeValue: appProblemsDefaultHeight,
        }}
        mainSlot={<section>main</section>}
        onActivityChange={() => undefined}
        problemsSlot={problems ? <div>problems</div> : null}
      />,
    );
  }

  it("does not render an empty context panel for context-free pages", () => {
    const markup = renderFrame({ context: false });

    expect(markup).toContain('aria-label="工作区功能"');
    expect(markup).not.toContain('<aside aria-label="笔记"');
    expect(markup).not.toContain("调整上下文区宽度");
  });

  it("renders context and detail resize affordances when slots exist", () => {
    const markup = renderFrame({ detail: true });

    expect(markup).toContain("调整上下文区宽度");
    expect(markup).toContain("调整右侧详情宽度");
    expect(markup).toContain(
      `aria-valuenow="${appContextDefaultWidth}"`,
    );
    expect(markup).toContain(
      `aria-valuenow="${appDetailDefaultWidth}"`,
    );
  });

  it("keeps a collapsed detail opener in its header", () => {
    const markup = renderFrame({ detail: true, detailCollapsed: true });

    expect(markup).toContain("展开右侧详情");
    expect(markup).not.toContain("detail</aside>");
  });

  it("keeps only the activity bar and main slot in focus mode", () => {
    const markup = renderFrame({ detail: true, focusMode: true });

    expect(markup).toContain('aria-label="工作区功能"');
    expect(markup).toContain("main");
    expect(markup).not.toContain(">context<");
    expect(markup).not.toContain(">detail<");
    expect(markup).not.toContain(">problems<");
  });

  it("keeps the global problems panel collapsed without a resize handle", () => {
    const markup = renderFrame();

    expect(markup).toContain('<aside aria-label="问题"');
    expect(markup).toContain("problems");
    expect(markup).not.toContain("调整问题面板高度");
  });

  it("renders an accessible height separator only while problems are expanded", () => {
    const markup = renderFrame({ problemsExpanded: true });

    expect(markup).toContain("调整问题面板高度");
    expect(markup).toContain(`aria-valuemin="${appProblemsMinHeight}"`);
    expect(markup).toContain(`aria-valuemax="${appProblemsMaxHeight}"`);
    expect(markup).toContain(`aria-valuenow="${appProblemsDefaultHeight}"`);
  });

  it("does not reserve a bottom region when no global panel is supplied", () => {
    const markup = renderFrame({ problems: false });

    expect(markup).not.toContain('<aside aria-label="问题"');
    expect(markup).not.toContain(">problems<");
  });
});
