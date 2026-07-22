// SPDX-License-Identifier: GPL-3.0-or-later

import {
  syntaxProfileValidationPolicies,
  syntaxProfileSchema,
  type SyntaxProfileSchemaDiagnostic,
} from "../../ctn/syntax/profileSchema.ts";
import {
  parseSyntaxProfileToml,
  type SyntaxProfileTomlDiagnostic,
} from "../../ctn/syntax/profileTomlParser.ts";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types.ts";

export const todoSyntaxProfileName = "代办";

// Kept runtime-neutral and mirrored by the system wire contract's provisioner.
// A contract test locks the two literals together without coupling this pure
// domain to contracts or storage.
export const defaultTodoSyntaxSourceV3 = `name = "代办"
tabDisplayWidth = 4

[title]
type = "title"
label = "事项集合"
tone = "blue"
textColor = "cyan"

[[markers]]
marker = "[]"
type = "todo-item"
label = "代办"
role = "normal"
tone = "default"
textColor = "cyan"

[[inlineRules]]
kind = "paired"
open = "[["
close = "]]"
type = "global-reference"
label = "引用"
tone = "blue"
textColor = "cyan"
`;

export type TodoSyntaxDiagnostic =
  | SyntaxProfileTomlDiagnostic
  | SyntaxProfileSchemaDiagnostic;

export type TodoSyntaxParseResult =
  | { diagnostics: []; profile: CtnSyntaxProfile }
  | { diagnostics: TodoSyntaxDiagnostic[]; profile: null };

function protectedDiagnostic(
  path: string,
  message: string,
): SyntaxProfileSchemaDiagnostic {
  return { code: "invalid-fixed-type", message, path };
}

export function parseTodoSyntaxSource(source: string): TodoSyntaxParseResult {
  const parsed = parseSyntaxProfileToml(
    source,
    syntaxProfileValidationPolicies.todo,
  );

  if (!parsed.profile) {
    return { diagnostics: parsed.diagnostics, profile: null };
  }
  const diagnostics: SyntaxProfileSchemaDiagnostic[] = [];

  if (parsed.profile.name !== todoSyntaxProfileName) {
    diagnostics.push(protectedDiagnostic(
      "$.name",
      `代办语法名称固定为“${todoSyntaxProfileName}”。`,
    ));
  }
  const rules = parsed.profile.markerRules.filter(
    ({ type }) => type === syntaxProfileSchema.requiredTypes.todoItem,
  );

  if (rules.length !== 1 || rules[0].role !== "normal") {
    diagnostics.push(protectedDiagnostic(
      "markers.todo-item",
      "代办语法必须保留唯一且角色为 normal 的 todo-item 规则。",
    ));
  }

  return diagnostics.length > 0
    ? { diagnostics, profile: null }
    : { diagnostics: [], profile: parsed.profile };
}

export function requireTodoSyntaxProfile(source: string) {
  const parsed = parseTodoSyntaxSource(source);

  if (!parsed.profile) {
    throw new Error(parsed.diagnostics[0]?.message ?? "代办语法配置无效。");
  }
  return parsed.profile;
}

const defaultParsed = parseTodoSyntaxSource(defaultTodoSyntaxSourceV3);

if (!defaultParsed.profile) {
  throw new Error("The built-in Todo syntax source is invalid.");
}

export const defaultTodoCtnSyntaxProfileV3 = defaultParsed.profile;
