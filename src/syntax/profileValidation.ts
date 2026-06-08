// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnSyntaxProfile } from "../ctn/types";

export function getSyntaxProfileShapeError(profile: CtnSyntaxProfile) {
  if (!Array.isArray(profile.markerRules)) {
    return `语法 ${profile.id}@${profile.version} 缺少 markers。`;
  }

  if (!Array.isArray(profile.inlineRules)) {
    return `语法 ${profile.id}@${profile.version} 缺少 inlineRules。`;
  }

  const invalidMarkerRule = profile.markerRules.find(
    (rule) => !rule.role || !rule.tone,
  );

  if (invalidMarkerRule) {
    return `语法 ${profile.id}@${profile.version} 的 marker ${invalidMarkerRule.marker} 缺少 role 或 tone。`;
  }

  const invalidInlineRule = profile.inlineRules.find((rule) => !rule.tone);

  if (invalidInlineRule) {
    return `语法 ${profile.id}@${profile.version} 的行内规则 ${invalidInlineRule.type} 缺少 tone。`;
  }

  return null;
}
