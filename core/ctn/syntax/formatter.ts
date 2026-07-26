// SPDX-License-Identifier: GPL-3.0-or-later

import { compileCtnSyntaxDefinition } from "./compiler.ts";
import { ctnSyntaxSchema } from "./schema.ts";
import type {
  CtnSyntaxDefinition,
  CtnSyntaxOwner,
} from "./types.ts";

function string(value: string) {
  return JSON.stringify(value);
}

function appendFields(
  lines: string[],
  value: object,
  fields: readonly string[],
) {
  const record = value as Record<string, unknown>;

  for (const field of fields) {
    const fieldValue = record[field];

    if (typeof fieldValue === "string") {
      lines.push(`${field} = ${string(fieldValue)}`);
    } else if (typeof fieldValue === "number") {
      lines.push(`${field} = ${fieldValue}`);
    } else {
      throw new Error(`CTN syntax formatter cannot write field ${field}.`);
    }
  }
}

function appendStyle(
  lines: string[],
  section: "root" | "title",
  style: NonNullable<CtnSyntaxDefinition["root"]>,
) {
  lines.push("", `[${section}]`);
  appendFields(lines, style, ctnSyntaxSchema.fields.display);
}

export function formatCtnSyntaxV2(
  definition: CtnSyntaxDefinition,
  owner: CtnSyntaxOwner,
) {
  const compiled = compileCtnSyntaxDefinition(definition, owner);

  if (!compiled.syntax) {
    throw new Error(
      compiled.diagnostics[0]?.message ?? "CTN 语法定义无效。",
    );
  }
  const lines: string[] = [];

  appendFields(lines, definition, ctnSyntaxSchema.fields.header);
  const policy = ctnSyntaxSchema.owners[owner];

  if (policy.title.source === "required" && definition.title) {
    appendStyle(lines, "title", definition.title);
  }
  if (policy.root.required && definition.root) {
    appendStyle(lines, "root", definition.root);
  }
  for (const block of definition.blocks) {
    lines.push("", "[[blocks]]");
    appendFields(lines, block, ctnSyntaxSchema.fields.block);
  }
  for (const rule of definition.inline) {
    lines.push("", "[[inline]]");
    appendFields(
      lines,
      rule,
      ctnSyntaxSchema.fields.inline[rule.kind],
    );
  }
  return `${lines.join("\n")}\n`;
}
