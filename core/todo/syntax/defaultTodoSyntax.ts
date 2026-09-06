// SPDX-License-Identifier: GPL-3.0-or-later

import {
  compileCtnSyntaxDefinition,
  formatCtnSyntaxV2,
} from "../../ctn/index.ts";

import type {
  CtnSyntaxDefinition,
} from "../../ctn/index.ts";

export const defaultTodoSyntaxDefinition = {
  blocks: [
    {
      kind: "line",
      label: "代办",
      marker: "[]",
      semanticId: "todo-item",
      textColor: "cyan",
      tone: "default",
    },
    {
      kind: "line",
      label: "注解",
      marker: ">",
      semanticId: "marker-rule-2",
      textColor: "green",
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
      textColor: "blue",
      tone: "blue",
    },
  ],
  name: "代办",
  root: null,
  tabDisplayWidth: 4,
  title: null,
} satisfies CtnSyntaxDefinition;

const compiled = compileCtnSyntaxDefinition(
  defaultTodoSyntaxDefinition,
  "todo",
);

if (!compiled.syntax) {
  throw new Error("The built-in Todo CTN syntax v2 is invalid.");
}

export const defaultTodoSyntax = compiled.syntax;

export const defaultTodoSyntaxSource = formatCtnSyntaxV2(
  defaultTodoSyntaxDefinition,
  "todo",
);
