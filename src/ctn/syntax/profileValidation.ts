// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnSyntaxProfile } from "./types";

const requiredGlobalReferenceType = "global-reference";

export function getSyntaxProfileShapeError(profile: CtnSyntaxProfile) {
  if (
    !profile.titleRule ||
    profile.titleRule.type !== "title" ||
    !profile.titleRule.tone
  ) {
    return "语法配置缺少首行标题规则。";
  }

  if (
    !profile.conceptRule ||
    profile.conceptRule.type !== "concept" ||
    !profile.conceptRule.tone
  ) {
    return "语法配置缺少顶格概念规则。";
  }

  if (!Array.isArray(profile.markerRules)) {
    return "语法配置缺少 markers。";
  }

  if (!Array.isArray(profile.inlineRules)) {
    return "语法配置缺少 inlineRules。";
  }

  const invalidMarkerRule = profile.markerRules.find(
    (rule) => !rule.role || !rule.tone,
  );

  if (invalidMarkerRule) {
    return `语法配置的 marker ${invalidMarkerRule.marker} 缺少 role 或 tone。`;
  }

  const invalidInlineRule = profile.inlineRules.find((rule) => !rule.tone);

  if (invalidInlineRule) {
    return `语法配置的行内规则 ${invalidInlineRule.type} 缺少 tone。`;
  }

  if (
    !profile.inlineRules.some(
      (rule) =>
        rule.kind === "paired" && rule.type === requiredGlobalReferenceType,
    )
  ) {
    return "语法配置缺少全局概念引用规则。";
  }

  return null;
}
