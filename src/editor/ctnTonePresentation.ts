import { isCustomSyntaxTone } from "../ctn/syntax/tones";
import type { CtnSyntaxTone } from "../ctn/syntax/types";

export function getCtnEditorToneClassName(tone: CtnSyntaxTone) {
  return isCustomSyntaxTone(tone) ? "ctn-tone-custom" : `ctn-tone-${tone}`;
}

export function getCtnEditorToneStyle(tone: CtnSyntaxTone) {
  return isCustomSyntaxTone(tone) ? `--ctn-tone-color: ${tone};` : undefined;
}

export function getCtnEditorTextColorClassName(tone: CtnSyntaxTone) {
  return isCustomSyntaxTone(tone)
    ? "ctn-text-color-custom"
    : `ctn-text-color-${tone}`;
}

export function getCtnEditorTextColorStyle(tone: CtnSyntaxTone) {
  return isCustomSyntaxTone(tone) ? `--ctn-text-color: ${tone};` : undefined;
}
