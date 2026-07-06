import { describe, expect, it } from "vitest";
import {
  appSidebarMaxWidth,
  appSidebarMinWidth,
  clampAppSidebarWidth,
  getAppSidebarKeyboardResizeWidth,
  resizeAppSidebarWidth,
} from "../../src/ui/sidebarResize";

describe("sidebar resize", () => {
  it("clamps sidebar widths to the supported range", () => {
    expect(clampAppSidebarWidth(appSidebarMinWidth - 80)).toBe(
      appSidebarMinWidth,
    );
    expect(clampAppSidebarWidth(292.4)).toBe(292);
    expect(clampAppSidebarWidth(appSidebarMaxWidth + 80)).toBe(
      appSidebarMaxWidth,
    );
  });

  it("resizes by delta without leaving the supported range", () => {
    expect(resizeAppSidebarWidth(292, 16)).toBe(308);
    expect(resizeAppSidebarWidth(292, -16)).toBe(276);
    expect(resizeAppSidebarWidth(appSidebarMinWidth, -16)).toBe(
      appSidebarMinWidth,
    );
    expect(resizeAppSidebarWidth(appSidebarMaxWidth, 16)).toBe(
      appSidebarMaxWidth,
    );
  });

  it("maps keyboard resize keys to width changes", () => {
    expect(getAppSidebarKeyboardResizeWidth(292, "ArrowLeft")).toBe(276);
    expect(getAppSidebarKeyboardResizeWidth(292, "ArrowRight")).toBe(308);
    expect(getAppSidebarKeyboardResizeWidth(292, "Enter")).toBeNull();
  });
});
