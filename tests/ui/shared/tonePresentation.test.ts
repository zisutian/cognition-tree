import { describe, expect, it } from "vitest";
import {
  createToneStyle,
  getTextColorClassName,
  getToneClassName,
  isCustomTone,
} from "../../../src/ui/shared/tonePresentation";

describe("tone presentation", () => {
  it("maps semantic tones to UI classes", () => {
    expect(getToneClassName("green")).toBe("ctn-tone-green");
    expect(getTextColorClassName("cyan")).toBe("ctn-text-color-cyan");
  });

  it("keeps custom color values in UI-owned CSS variables", () => {
    expect(isCustomTone("#397c72")).toBe(true);
    expect(getToneClassName("#397c72")).toBe("ctn-tone-custom");
    expect(getTextColorClassName("#abcdef")).toBe("ctn-text-color-custom");
    expect(createToneStyle("#397c72", "#abcdef")).toEqual({
      "--ctn-text-color": "#abcdef",
      "--ctn-tone-color": "#397c72",
    });
  });
});
