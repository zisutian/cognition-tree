import { FileText } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppFrame } from "../../src/ui/AppFrame";
import type { ActivityItem } from "../../src/ui/activityTypes";

const activityItems: ActivityItem[] = [
  { id: "notes", label: "笔记", icon: FileText },
];

function renderAppFrame({
  sidebarCollapsed = false,
  sidebarWidth = 320,
}: {
  sidebarCollapsed?: boolean;
  sidebarWidth?: number | null;
} = {}) {
  return renderToStaticMarkup(
    <AppFrame
      activeActivityId="notes"
      activityItems={activityItems}
      detailSlot={null}
      isSidebarResizing={false}
      mainSlot={<section className="editor-panel">main</section>}
      sidebarCollapsed={sidebarCollapsed}
      sidebarResizeValue={sidebarWidth ?? 292}
      sidebarSlot={<div>sidebar</div>}
      sidebarWidth={sidebarWidth}
      onActivityChange={() => undefined}
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

  it("keeps the resize handle hidden while the sidebar is collapsed", () => {
    const markup = renderAppFrame({ sidebarCollapsed: true });

    expect(markup).toContain("sidebar-collapsed");
    expect(markup).not.toContain("aria-label=\"调整左侧栏宽度\"");
  });
});
