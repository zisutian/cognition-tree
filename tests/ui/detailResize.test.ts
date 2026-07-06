import { describe, expect, it } from "vitest";
import {
  appDetailMaxWidth,
  appDetailMinWidth,
  clampAppDetailWidth,
  getAppDetailKeyboardResizeWidth,
  resizeAppDetailWidth,
} from "../../src/ui/detailResize";

describe("detail resize", () => {
  it("clamps detail widths to the supported range", () => {
    expect(clampAppDetailWidth(appDetailMinWidth - 80)).toBe(
      appDetailMinWidth,
    );
    expect(clampAppDetailWidth(340.4)).toBe(340);
    expect(clampAppDetailWidth(appDetailMaxWidth + 80)).toBe(
      appDetailMaxWidth,
    );
  });

  it("resizes by delta without leaving the supported range", () => {
    expect(resizeAppDetailWidth(340, 16)).toBe(356);
    expect(resizeAppDetailWidth(340, -16)).toBe(324);
    expect(resizeAppDetailWidth(appDetailMinWidth, -16)).toBe(
      appDetailMinWidth,
    );
    expect(resizeAppDetailWidth(appDetailMaxWidth, 16)).toBe(
      appDetailMaxWidth,
    );
  });

  it("maps keyboard resize keys to right detail width changes", () => {
    expect(getAppDetailKeyboardResizeWidth(340, "ArrowLeft")).toBe(356);
    expect(getAppDetailKeyboardResizeWidth(340, "ArrowRight")).toBe(324);
    expect(getAppDetailKeyboardResizeWidth(340, "Enter")).toBeNull();
  });
});
