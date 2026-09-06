// SPDX-License-Identifier: GPL-3.0-or-later

import {
  compileCtnSyntaxDefinition,
  formatCtnSyntaxV2,
} from "../../ctn/index.ts";

import type {
  CtnSyntaxDefinition,
} from "../../ctn/index.ts";

export const defaultJournalSyntaxDefinition = {
  blocks: [
    {
      kind: "line",
      label: "定义",
      marker: ":",
      semanticId: "definition",
      textColor: "teal",
      tone: "default",
    },
    {
      kind: "line",
      label: "疑问",
      marker: "?",
      semanticId: "question",
      textColor: "amber",
      tone: "default",
    },
    {
      kind: "line",
      label: "理解",
      marker: ">",
      semanticId: "personal-understanding",
      textColor: "violet",
      tone: "default",
    },
    {
      kind: "line",
      label: "组分",
      marker: "-",
      semanticId: "component",
      textColor: "blue",
      tone: "default",
    },
  ],
  formatVersion: 2,
  inline: [
    {
      close: "]]",
      kind: "paired",
      label: "引用",
      open: "[[",
      semanticId: "global-reference",
      textColor: "gray",
      tone: "gray",
    },
    {
      close: ">",
      kind: "paired",
      label: "条目内块引用",
      open: "<",
      semanticId: "local-reference",
      textColor: "gray",
      tone: "gray",
    },
    {
      kind: "single",
      label: "并列分隔",
      marker: "\\",
      semanticId: "parallel-separator",
      textColor: "amber",
      tone: "amber",
    },
  ],
  name: "日记",
  root: {
    label: "正文",
    textColor: "default",
    tone: "default",
  },
  tabDisplayWidth: 8,
  title: null,
} satisfies CtnSyntaxDefinition;

const compiled = compileCtnSyntaxDefinition(
  defaultJournalSyntaxDefinition,
  "journal",
);

if (!compiled.syntax) {
  throw new Error("The built-in Journal CTN syntax v2 is invalid.");
}

export const defaultJournalSyntax = compiled.syntax;

export const defaultJournalSyntaxSource = formatCtnSyntaxV2(
  defaultJournalSyntaxDefinition,
  "journal",
);
