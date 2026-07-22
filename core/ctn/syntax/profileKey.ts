// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnSyntaxProfile } from "./types.ts";

export function createCtnSyntaxParseProfileKey(
  syntaxProfile: CtnSyntaxProfile,
) {
  return JSON.stringify({
    topLevelUnmarkedRule: syntaxProfile.topLevelUnmarkedRule,
    titleRule: syntaxProfile.titleRule,
    inlineRules: syntaxProfile.inlineRules,
    markerRules: syntaxProfile.markerRules,
  });
}
