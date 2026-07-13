import type { CSSProperties } from "react";

type ToneValue = string;

type ToneStyle = CSSProperties & {
  "--ctn-text-color"?: string;
  "--ctn-tone-color"?: string;
};

const customTonePattern = /^#[0-9a-fA-F]{6}$/;

export function isCustomTone(tone: ToneValue) {
  return customTonePattern.test(tone);
}

export function getToneClassName(tone: ToneValue) {
  return isCustomTone(tone) ? "ctn-tone-custom" : `ctn-tone-${tone}`;
}

export function getTextColorClassName(tone: ToneValue) {
  return isCustomTone(tone)
    ? "ctn-text-color-custom"
    : `ctn-text-color-${tone}`;
}

export function createToneStyle(
  tone: ToneValue,
  textColor: ToneValue,
): ToneStyle | undefined {
  const style: ToneStyle = {};

  if (isCustomTone(tone)) {
    style["--ctn-tone-color"] = tone;
  }

  if (isCustomTone(textColor)) {
    style["--ctn-text-color"] = textColor;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}
