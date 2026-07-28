import { describe, expect, it } from "vitest";
import {
  appContextDefaultWidth,
  appContextMaxWidth,
  appContextMinWidth,
  appDetailDefaultWidth,
  appDetailMaxWidth,
  appDetailMinWidth,
  appProblemsDefaultHeight,
  appProblemsMaxHeight,
  appProblemsMinHeight,
  appResizeKeyboardStep,
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
    const cases = [
      [
        getAppContextKeyboardResizeWidth,
        appContextDefaultWidth,
        "ArrowLeft",
        appContextDefaultWidth - appResizeKeyboardStep,
      ],
      [
        getAppContextKeyboardResizeWidth,
        appContextDefaultWidth,
        "ArrowRight",
        appContextDefaultWidth + appResizeKeyboardStep,
      ],
      [
        getAppDetailKeyboardResizeWidth,
        appDetailDefaultWidth,
        "ArrowLeft",
        appDetailDefaultWidth + appResizeKeyboardStep,
      ],
      [
        getAppDetailKeyboardResizeWidth,
        appDetailDefaultWidth,
        "ArrowRight",
        appDetailDefaultWidth - appResizeKeyboardStep,
      ],
      [
        getAppProblemsKeyboardResizeHeight,
        appProblemsDefaultHeight,
        "ArrowUp",
        appProblemsDefaultHeight + appResizeKeyboardStep,
      ],
      [
        getAppProblemsKeyboardResizeHeight,
        appProblemsDefaultHeight,
        "ArrowDown",
        appProblemsDefaultHeight - appResizeKeyboardStep,
      ],
    ] as const;

    for (const [resize, value, key, expected] of cases) {
      expect(resize(value, key)).toBe(expected);
    }
    expect(
      getAppDetailKeyboardResizeWidth(appDetailDefaultWidth, "Enter"),
    ).toBeNull();
    expect(
      getAppProblemsKeyboardResizeHeight(
        appProblemsDefaultHeight,
        "ArrowLeft",
      ),
    ).toBeNull();
  });
});
