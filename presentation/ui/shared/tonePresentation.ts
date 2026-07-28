import type { CSSProperties } from "react";
import {
  isCustomSyntaxTone,
} from "../../../core/ctn/syntax/tones";
import type {
  CtnSyntaxTone,
} from "../../../core/ctn/syntax/types";

type ToneStyle = CSSProperties & {
  "--ctn-text-color"?: string;
  "--ctn-tone-color"?: string;
};

export const isCustomTone = isCustomSyntaxTone;

export function getToneClassName(tone: CtnSyntaxTone) {
  return isCustomTone(tone) ? "ctn-tone-custom" : `ctn-tone-${tone}`;
}

export function getTextColorClassName(tone: CtnSyntaxTone) {
  return isCustomTone(tone)
    ? "ctn-text-color-custom"
    : `ctn-text-color-${tone}`;
}

export function getToneStyleDeclaration(tone: CtnSyntaxTone) {
  return isCustomTone(tone) ? `--ctn-tone-color: ${tone};` : undefined;
}

export function getTextColorStyleDeclaration(tone: CtnSyntaxTone) {
  return isCustomTone(tone) ? `--ctn-text-color: ${tone};` : undefined;
}

export function createToneStyle(
  tone: CtnSyntaxTone,
  textColor: CtnSyntaxTone,
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
