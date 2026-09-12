import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContextMenu } from "../../../../presentation/ui/shared/ContextMenu";

import { resolveOverlayCoordinates } from "../../../../presentation/ui/shared/Overlay";
import { QuickPick } from "../../../../presentation/ui/shared/QuickPick";

describe("overlay semantics and positioning", () => {
  it("renders quick pick options with searchable dialog semantics", () => {
    const markup = renderToStaticMarkup(
      <QuickPick
        ariaLabel="移动到"
        open
        options={[{ description: "工作区根级", id: "root", label: "根目录" }]}
        onClose={() => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain("aria-controls=");
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('role="option"');
    expect(markup).toContain("根目录");
  });

  it("renders context menus with only supplied commands", () => {
    const markup = renderToStaticMarkup(
      <ContextMenu
        ariaLabel="目录操作"
        items={[{ id: "move", label: "移动到…", onSelect: () => undefined }]}
        position={{ x: 10, y: 20 }}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('role="menu"');
    expect(markup).toContain('role="menuitem"');
    expect(markup).toContain("移动到…");
    expect(markup).not.toContain("删除");
  });

  it("clamps point and anchored overlays into the viewport", () => {
    expect(
      resolveOverlayCoordinates({
        panelHeight: 80,
        panelWidth: 120,
        point: { x: 395, y: 295 },
        viewportHeight: 300,
        viewportWidth: 400,
      }),
    ).toEqual({ left: 272, top: 212 });
    expect(
      resolveOverlayCoordinates({
        align: "end",
        anchorRect: {
          bottom: 290,
          left: 350,
          right: 390,
          top: 270,
          width: 40,
        },
        panelHeight: 100,
        panelWidth: 160,
        viewportHeight: 300,
        viewportWidth: 400,
      }),
    ).toEqual({ left: 230, top: 166 });
  });
});
