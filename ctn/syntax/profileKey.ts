// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnSyntaxProfile } from "./types.ts";

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
