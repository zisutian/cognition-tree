// SPDX-License-Identifier: GPL-3.0-or-later

import {
  compileCtnSyntaxDefinition,
} from "./compiler.ts";
import { formatCtnSyntaxV2 } from "./formatter.ts";
import type { CtnSyntaxDefinition } from "./types.ts";

export const defaultCtnSyntaxDefinition = {
  blocks: [
    {
      kind: "multiline",
      label: "代码块",
      marker: "```",
      semanticId: "multiline-block",
      textColor: "green",
      tone: "gray",
    },
    {
      kind: "line",
      label: "定义",
      marker: ":",
      semanticId: "definition",
      textColor: "teal",
      tone: "green",
    },
    {
      kind: "line",
      label: "疑问",
      marker: "?",
      semanticId: "question",
      textColor: "amber",
      tone: "amber",
    },
    {
      kind: "line",
      label: "理解",
      marker: ">",
      semanticId: "personal-understanding",
      textColor: "violet",
      tone: "violet",
    },
    {
      kind: "line",
      label: "组分",
      marker: "-",
      semanticId: "component",
      textColor: "blue",
      tone: "blue",
    },
  ],
  formatVersion: 2,
  inline: [
    {
      close: "]]",
      kind: "paired",
      label: "全局概念引用",
      open: "[[",
      semanticId: "global-reference",
      textColor: "blue",
      tone: "blue",
    },
    {
      close: "`",
      kind: "paired",
      label: "行内代码",
      open: "`",
      semanticId: "inline-code",
      textColor: "green",
      tone: "green",
    },
    {
      close: ">",
      kind: "paired",
      label: "局部概念引用",
      open: "<",
      semanticId: "local-reference",
      textColor: "teal",
      tone: "teal",
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
  name: "默认 CTN 语法",
  root: {
    label: "顶格概念",
    textColor: "cyan",
    tone: "blue",
  },
  tabDisplayWidth: 4,
  title: {
    label: "标题",
    textColor: "cyan",
    tone: "blue",
  },
} satisfies CtnSyntaxDefinition;

const compiled = compileCtnSyntaxDefinition(
  defaultCtnSyntaxDefinition,
  "workspace",
);

if (!compiled.syntax) {
  throw new Error("The built-in Workspace CTN syntax v2 is invalid.");
}

export const defaultCtnSyntax = compiled.syntax;

export const defaultCtnSyntaxSource = formatCtnSyntaxV2(
  defaultCtnSyntaxDefinition,
  "workspace",
);
