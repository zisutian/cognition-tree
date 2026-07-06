import type { CtnSyntaxProfile } from "./types";

export function createCtnSyntaxParseProfileKey(
  syntaxProfile: CtnSyntaxProfile,
) {
  return JSON.stringify({
    conceptRule: syntaxProfile.conceptRule,
    titleRule: syntaxProfile.titleRule,
    inlineRules: syntaxProfile.inlineRules,
    markerRules: syntaxProfile.markerRules,
  });
}
