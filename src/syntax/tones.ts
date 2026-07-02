import type {
  CtnCustomSyntaxTone,
  CtnPresetSyntaxTone,
  CtnSyntaxTone,
} from "./types";

export const configurableSyntaxTones: CtnPresetSyntaxTone[] = [
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
  "red",
  "amber",
  "gray",
  "code",
];

export const customSyntaxTonePattern = /^#[0-9a-fA-F]{6}$/;

export function isCustomSyntaxTone(
  tone: string,
): tone is CtnCustomSyntaxTone {
  return customSyntaxTonePattern.test(tone);
}

export function isPresetSyntaxTone(
  tone: string,
): tone is CtnPresetSyntaxTone {
  return configurableSyntaxTones.includes(tone as CtnPresetSyntaxTone);
}

export function isConfigurableSyntaxTone(
  tone: string,
): tone is CtnPresetSyntaxTone | CtnCustomSyntaxTone {
  return isPresetSyntaxTone(tone) || isCustomSyntaxTone(tone);
}

export function getSyntaxToneClassName(tone: CtnSyntaxTone) {
  return isCustomSyntaxTone(tone) ? "ctn-tone-custom" : `ctn-tone-${tone}`;
}

export function getSyntaxToneStyle(tone: CtnSyntaxTone) {
  return isCustomSyntaxTone(tone) ? `--ctn-tone-color: ${tone};` : undefined;
}
