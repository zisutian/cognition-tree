import { describe, expect, it } from "vitest";
import {
  appContextDefaultWidth,
  appContextMaxWidth,
  appContextMinWidth,
  appDetailMaxWidth,
  appDetailMinWidth,
  appProblemsDefaultHeight,
  appProblemsMaxHeight,
  appProblemsMinHeight,
  clampAppContextWidth,
  clampAppDetailWidth,
  clampAppProblemsHeight,
  getAppContextKeyboardResizeWidth,
  getAppDetailKeyboardResizeWidth,
  getAppProblemsKeyboardResizeHeight,
} from "../../../presentation/ui/workbench/frameResize";

describe("frame resize", () => {
  it("clamps context and detail widths", () => {
    expect(clampAppContextWidth(appContextMinWidth - 10)).toBe(appContextMinWidth);
    expect(clampAppContextWidth(appContextMaxWidth + 10)).toBe(appContextMaxWidth);
    expect(clampAppDetailWidth(appDetailMinWidth - 10)).toBe(appDetailMinWidth);
    expect(clampAppDetailWidth(appDetailMaxWidth + 10)).toBe(appDetailMaxWidth);
    expect(clampAppContextWidth(Number.NaN)).toBe(appContextDefaultWidth);
  });

  it("clamps the global problems panel height", () => {
    expect(clampAppProblemsHeight(appProblemsMinHeight - 10)).toBe(
      appProblemsMinHeight,
    );
    expect(clampAppProblemsHeight(appProblemsMaxHeight + 10)).toBe(
      appProblemsMaxHeight,
    );
    expect(clampAppProblemsHeight(Number.NaN)).toBe(
      appProblemsDefaultHeight,
    );
  });

  it("maps keyboard resize directions", () => {
    expect(getAppContextKeyboardResizeWidth(280, "ArrowLeft")).toBe(264);
    expect(getAppContextKeyboardResizeWidth(280, "ArrowRight")).toBe(296);
    expect(getAppDetailKeyboardResizeWidth(320, "ArrowLeft")).toBe(336);
    expect(getAppDetailKeyboardResizeWidth(320, "ArrowRight")).toBe(304);
    expect(getAppDetailKeyboardResizeWidth(320, "Enter")).toBeNull();
    expect(getAppProblemsKeyboardResizeHeight(200, "ArrowUp")).toBe(216);
    expect(getAppProblemsKeyboardResizeHeight(200, "ArrowDown")).toBe(184);
    expect(getAppProblemsKeyboardResizeHeight(200, "ArrowLeft")).toBeNull();
  });
});
