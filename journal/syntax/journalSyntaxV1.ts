// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnSyntaxProfile } from "../../ctn/syntax/types.ts";

function freezeRule<Rule extends object>(rule: Rule) {
  return Object.freeze(rule);
}

/**
 * Journal schema v1 is permanently coupled to this profile. Keep the literal
 * independent from the workspace default profile so future workspace syntax
 * changes cannot reinterpret persisted journal entries.
 */
export const journalCtnSyntaxProfileV1 = Object.freeze({
  name: "日记 CTN 语法 v1",
  tabDisplayWidth: 4,
  titleRule: freezeRule({
    type: "title",
    label: "标题",
    textColor: "cyan",
    tone: "blue",
  }),
  conceptRule: freezeRule({
    type: "concept",
    label: "顶格概念",
    textColor: "cyan",
    tone: "blue",
  }),
  markerRules: Object.freeze([
    freezeRule({
      marker: "```",
      type: "multiline-block",
      label: "多行块",
      role: "multiline",
      textColor: "green",
      tone: "gray",
    }),
    freezeRule({
      marker: ":",
      type: "definition",
      label: "定义",
      role: "normal",
      textColor: "teal",
      tone: "green",
    }),
    freezeRule({
      marker: "?",
      type: "question",
      label: "疑问",
      role: "normal",
      textColor: "amber",
      tone: "amber",
    }),
    freezeRule({
      marker: ">",
      type: "personal-understanding",
      label: "理解",
      role: "normal",
      textColor: "violet",
      tone: "violet",
    }),
    freezeRule({
      marker: "-",
      type: "component",
      label: "组分",
      role: "normal",
      textColor: "blue",
      tone: "blue",
    }),
  ]),
  inlineRules: Object.freeze([
    freezeRule({
      close: "]]",
      kind: "paired",
      label: "日记条目引用",
      open: "[[",
      textColor: "cyan",
      tone: "blue",
      type: "global-reference",
    }),
    freezeRule({
      close: "`",
      kind: "paired",
      label: "行内代码",
      open: "`",
      textColor: "green",
      tone: "green",
      type: "inline-code",
    }),
    freezeRule({
      close: ">",
      kind: "paired",
      label: "条目内概念引用",
      open: "<",
      textColor: "teal",
      tone: "teal",
      type: "local-reference",
    }),
    freezeRule({
      kind: "single",
      label: "并列分隔",
      marker: "\\",
      textColor: "amber",
      tone: "amber",
      type: "parallel-separator",
    }),
  ]),
}) as unknown as CtnSyntaxProfile;
