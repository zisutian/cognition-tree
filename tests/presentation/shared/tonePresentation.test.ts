import { describe, expect, it } from "vitest";
import {
  configurableSyntaxTones,
} from "../../../core/ctn/syntax/tones";
import {
  createToneStyle,
  getTextColorClassName,
  getTextColorStyleDeclaration,
  getToneClassName,
  getToneStyleDeclaration,
  isCustomTone,
} from "../../../presentation/ui/shared/tonePresentation";

describe("tone presentation", () => {
  it("maps the complete preset vocabulary through one class convention", () => {
    const tones = ["default", ...configurableSyntaxTones] as const;

    expect(tones.map((tone) => ({
      text: getTextColorClassName(tone),
      tone,
      background: getToneClassName(tone),
    }))).toEqual(tones.map((tone) => ({
      text: `ctn-text-color-${tone}`,
      tone,
      background: `ctn-tone-${tone}`,
    })));
  });

  it("keeps custom color values in UI-owned CSS variables", () => {
    expect(isCustomTone("#397c72")).toBe(true);
    expect(getToneClassName("#397c72")).toBe("ctn-tone-custom");
    expect(getTextColorClassName("#abcdef")).toBe("ctn-text-color-custom");
    expect(createToneStyle("#397c72", "#abcdef")).toEqual({
      "--ctn-text-color": "#abcdef",
      "--ctn-tone-color": "#397c72",
    });
    expect(getToneStyleDeclaration("#397c72")).toBe(
      "--ctn-tone-color: #397c72;",
    );
    expect(getTextColorStyleDeclaration("#abcdef")).toBe(
      "--ctn-text-color: #abcdef;",
    );
  });
});
