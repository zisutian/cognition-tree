import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppFrame } from "../../src/ui/AppFrame";
import type { ActivityItem } from "../../src/ui/activityTypes";

const activityItems: ActivityItem[] = [
  { id: "notes", label: "笔记", icon: FileText },
];

function renderAppFrame({
  detailCollapsed = false,
  detailWidth = null,
  detailSlot = null,
  sidebarCollapsed = false,
  sidebarWidth = 320,
}: {
  detailCollapsed?: boolean;
  detailWidth?: number | null;
  detailSlot?: ReactNode;
  sidebarCollapsed?: boolean;
  sidebarWidth?: number | null;
} = {}) {
  return renderToStaticMarkup(
    <AppFrame
      activeActivityId="notes"
      activityItems={activityItems}
      detailCollapsed={detailCollapsed}
      detailResizeValue={detailWidth ?? 340}
      detailSlot={detailSlot}
      detailWidth={detailWidth}
      isDetailResizing={false}
      isSidebarResizing={false}
      mainSlot={<section className="ui-panel ui-panel-editor">main</section>}
      sidebarCollapsed={sidebarCollapsed}
      sidebarResizeValue={sidebarWidth ?? 292}
      sidebarSlot={<div>sidebar</div>}
      sidebarWidth={sidebarWidth}
      onActivityChange={() => undefined}
      onDetailResizeKeyDown={() => undefined}
      onDetailResizeStart={() => undefined}
      onDetailToggle={() => undefined}
      onSidebarResizeKeyDown={() => undefined}
      onSidebarResizeStart={() => undefined}
    />,
  );
}

describe("AppFrame", () => {
  it("renders a sidebar resize handle with width aria values", () => {
    const markup = renderAppFrame();

    expect(markup).toContain("style=\"--app-sidebar-width:320px\"");
    expect(markup).toContain("role=\"separator\"");
    expect(markup).toContain("aria-label=\"调整左侧栏宽度\"");
    expect(markup).toContain("aria-orientation=\"vertical\"");
    expect(markup).toContain("aria-valuemin=\"220\"");
    expect(markup).toContain("aria-valuemax=\"420\"");
    expect(markup).toContain("aria-valuenow=\"320\"");
    expect(markup).toContain("aria-valuetext=\"320px\"");
  });

  it("renders a right detail resize handle with width aria values", () => {
    const markup = renderAppFrame({
      detailSlot: <aside className="ui-panel ui-panel-outline">outline</aside>,
      detailWidth: 360,
    });

    expect(markup).toContain(
      "style=\"--app-detail-width:360px;--app-sidebar-width:320px\"",
    );
    expect(markup).toContain("aria-label=\"调整右侧栏宽度\"");
    expect(markup).toContain("aria-orientation=\"vertical\"");
    expect(markup).toContain("aria-valuemin=\"260\"");
    expect(markup).toContain("aria-valuemax=\"520\"");
    expect(markup).toContain("aria-valuenow=\"360\"");
    expect(markup).toContain("aria-valuetext=\"360px\"");
  });

  it("keeps the resize handle hidden while the sidebar is collapsed", () => {
    const markup = renderAppFrame({ sidebarCollapsed: true });

    expect(markup).toContain("sidebar-collapsed");
    expect(markup).not.toContain("aria-label=\"调整左侧栏宽度\"");
  });

  it("wraps a right detail slot without adding an expanded-frame button", () => {
    const markup = renderAppFrame({
      detailSlot: <aside className="ui-panel ui-panel-outline">outline</aside>,
    });

    expect(markup).toContain("app-detail-region");
    expect(markup).not.toContain("aria-label=\"收回右侧栏\"");
    expect(markup).toContain("outline");
  });

  it("keeps a right detail expand button while the detail slot is collapsed", () => {
    const markup = renderAppFrame({
      detailCollapsed: true,
      detailSlot: <aside className="ui-panel ui-panel-outline">outline</aside>,
    });

    expect(markup).toContain("detail-collapsed");
    expect(markup).toContain("app-detail-region-collapsed");
    expect(markup).toContain("app-detail-collapsed-header");
    expect(markup).toContain("app-detail-toggle");
    expect(markup).toContain("aria-label=\"展开右侧栏\"");
    expect(markup).not.toContain("aria-label=\"调整右侧栏宽度\"");
    expect(markup).not.toContain("outline</aside>");
  });

  it("does not render a right detail toggle without a detail slot", () => {
    const markup = renderAppFrame();

    expect(markup).not.toContain("aria-label=\"收回右侧栏\"");
    expect(markup).not.toContain("aria-label=\"展开右侧栏\"");
    expect(markup).not.toContain("app-detail-region");
  });
});
