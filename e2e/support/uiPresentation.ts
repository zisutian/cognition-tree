import type { Locator } from "@playwright/test";

type ComputedStyleProperty =
  | "backgroundColor"
  | "color"
  | "outlineStyle"
  | "outlineWidth"
  | "tabSize"
  | "textDecorationColor";

type CtnTonePresentation = "background" | "foreground";

const ctnTonePresentationProperties = {
  background: "--ctn-tone-background",
  foreground: "--ctn-tone-current",
} as const satisfies Record<CtnTonePresentation, string>;

export function readComputedStyleValue(
  locator: Locator,
  property: ComputedStyleProperty,
) {
  return locator.evaluate(
    (element, styleProperty) => getComputedStyle(element)[styleProperty],
    property,
  );
}

export function readCtnTonePresentation(
  locator: Locator,
  presentation: CtnTonePresentation,
) {
  return locator.evaluate(
    (element, property) =>
      getComputedStyle(element).getPropertyValue(property).trim(),
    ctnTonePresentationProperties[presentation],
  );
}
