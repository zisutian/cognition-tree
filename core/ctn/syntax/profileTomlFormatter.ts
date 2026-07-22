// SPDX-License-Identifier: GPL-3.0-or-later

import {
  syntaxProfileSchema,
  syntaxProfileValidationPolicies,
  type CtnSyntaxProfileValidationPolicy,
} from "./profileSchema.ts";
import type { CtnSyntaxProfile } from "./types.ts";

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

export function formatSyntaxProfileToml(
  profile: CtnSyntaxProfile,
  policy: CtnSyntaxProfileValidationPolicy =
    syntaxProfileValidationPolicies.workspace,
): string {
  const lines = [
    "# CTN 语法配置文件。",
    "# name：界面中显示的人类可读名称。",
    "# tabDisplayWidth：一个 Tab 在编辑器中显示为几格宽；CTN 源文件仍使用 Tab 存储层级。",
    `name = ${formatTomlString(profile.name)}`,
    `tabDisplayWidth = ${profile.tabDisplayWidth}`,
    "",
    "# title：固定第 1 行的笔记标题规则。",
    "# type 固定为 title；label、tone、textColor 控制标题块显示。",
    "[title]",
    `type = ${formatTomlString(profile.titleRule.type)}`,
    `label = ${formatTomlString(profile.titleRule.label)}`,
    `tone = ${formatTomlString(profile.titleRule.tone)}`,
    `textColor = ${formatTomlString(profile.titleRule.textColor)}`,
  ];

  if (policy.scope === "todo") {
    if (profile.topLevelUnmarkedRule !== null) {
      throw new Error("Todo syntax cannot format a top-level unmarked rule.");
    }
  } else {
    const rule = profile.topLevelUnmarkedRule;

    if (rule === null) {
      throw new Error(
        `${policy.scope} syntax requires a top-level unmarked rule.`,
      );
    }

    const section = policy.scope === "workspace" ? "concept" : "body";
    const description =
      policy.scope === "workspace"
        ? "没有行首符号、且位于顶格的概念行规则。"
        : "没有行首符号、且位于顶格的正文行规则。";

    lines.push(
      "",
      `# ${section}：${description}`,
      `# type 固定为 ${rule.type}；label 是界面显示名称。`,
      "# tone 是弱背景颜色；textColor 是字体颜色，视觉优先级高于背景。",
      `[${section}]`,
      `type = ${formatTomlString(rule.type)}`,
      `label = ${formatTomlString(rule.label)}`,
      `tone = ${formatTomlString(rule.tone)}`,
      `textColor = ${formatTomlString(rule.textColor)}`,
    );
  }

  lines.push(
    "",
    "# markers：行首块规则。",
    "# marker：缩进之后匹配的字面量行首标记。",
    "# type：可扩展的语义 ID，使用 ASCII kebab-case。",
    "# label：该规则在界面中显示的名称。",
    '# role：解析行为。"normal" 表示普通块；"multiline" 表示多行块。',
    `# tone：弱背景颜色，可选 ${syntaxProfileSchema.tones.join("、")} 或 #RRGGBB。`,
    "# textColor：字体颜色，和正文可读性直接相关，优先于 tone。",
  );

  for (const markerRule of profile.markerRules) {
    lines.push(
      "",
      "[[markers]]",
      `marker = ${formatTomlString(markerRule.marker)}`,
      `type = ${formatTomlString(markerRule.type)}`,
      `label = ${formatTomlString(markerRule.label)}`,
      `role = ${formatTomlString(markerRule.role)}`,
      `tone = ${formatTomlString(markerRule.tone)}`,
      `textColor = ${formatTomlString(markerRule.textColor)}`,
    );
  }

  lines.push(
    "",
    "# inlineRules：普通块内部的行内结构规则。",
    '# kind = "paired"：匹配 open 和 close 之间的文本。',
    '# kind = "single"：用一个字面量标记触发行内结构；显示范围扩展到左右最近空白之间。',
    "# type、label、tone、textColor 的含义与 markers 中一致。",
  );

  for (const inlineRule of profile.inlineRules) {
    lines.push(
      "",
      "[[inlineRules]]",
      `kind = ${formatTomlString(inlineRule.kind)}`,
    );

    if (inlineRule.kind === "paired") {
      lines.push(
        `open = ${formatTomlString(inlineRule.open)}`,
        `close = ${formatTomlString(inlineRule.close)}`,
      );
    } else {
      lines.push(`marker = ${formatTomlString(inlineRule.marker)}`);
    }

    lines.push(
      `type = ${formatTomlString(inlineRule.type)}`,
      `label = ${formatTomlString(inlineRule.label)}`,
      `tone = ${formatTomlString(inlineRule.tone)}`,
      `textColor = ${formatTomlString(inlineRule.textColor)}`,
    );
  }

  return `${lines.join("\n")}\n`;
}
