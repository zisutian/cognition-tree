import { describe, expect, it } from "vitest";
import {
  appContextMaxWidth,
  appContextMinWidth,
  appDetailMaxWidth,
  appDetailMinWidth,
  clampAppContextWidth,
  clampAppDetailWidth,
  getAppContextKeyboardResizeWidth,
  getAppDetailKeyboardResizeWidth,
} from "../../src/ui/frameResize";

describe("frame resize", () => {
  it("clamps context and detail widths", () => {
    expect(clampAppContextWidth(appContextMinWidth - 10)).toBe(appContextMinWidth);
    expect(clampAppContextWidth(appContextMaxWidth + 10)).toBe(appContextMaxWidth);
    expect(clampAppDetailWidth(appDetailMinWidth - 10)).toBe(appDetailMinWidth);
    expect(clampAppDetailWidth(appDetailMaxWidth + 10)).toBe(appDetailMaxWidth);
  });

  it("maps keyboard resize directions", () => {
    expect(getAppContextKeyboardResizeWidth(280, "ArrowLeft")).toBe(264);
    expect(getAppContextKeyboardResizeWidth(280, "ArrowRight")).toBe(296);
    expect(getAppDetailKeyboardResizeWidth(320, "ArrowLeft")).toBe(336);
    expect(getAppDetailKeyboardResizeWidth(320, "ArrowRight")).toBe(304);
    expect(getAppDetailKeyboardResizeWidth(320, "Enter")).toBeNull();
  });
});
