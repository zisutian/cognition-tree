import type {
  CtnCustomSyntaxTone,
  CtnPresetSyntaxTone,
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
