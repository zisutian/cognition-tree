// SPDX-License-Identifier: GPL-3.0-or-later

import {
  syntaxProfileValidationPolicies,
  type SyntaxProfileSchemaDiagnostic,
} from "../../ctn/syntax/profileSchema.ts";
import {
  parseSyntaxProfileToml,
  type SyntaxProfileTomlDiagnostic,
} from "../../ctn/syntax/profileTomlParser.ts";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types.ts";

export const journalSyntaxProfileName = "日记";

// Kept runtime-neutral and mirrored by the system wire contract's provisioner.
// A contract test locks the two literals together without coupling this pure
// domain to contracts or storage.
export const defaultJournalSyntaxSourceV2 = `name = "日记"
tabDisplayWidth = 4

[title]
type = "title"
label = "标题"
tone = "blue"
textColor = "cyan"

[body]
type = "body"
label = "正文"
tone = "default"
textColor = "default"

[[markers]]
marker = ":"
type = "definition"
label = "定义"
role = "normal"
tone = "green"
textColor = "teal"

[[markers]]
marker = "?"
type = "question"
label = "疑问"
role = "normal"
tone = "amber"
textColor = "amber"

[[markers]]
marker = ">"
type = "personal-understanding"
label = "理解"
role = "normal"
tone = "violet"
textColor = "violet"

[[markers]]
marker = "-"
type = "component"
label = "组分"
role = "normal"
tone = "blue"
textColor = "blue"

[[inlineRules]]
kind = "paired"
open = "[["
close = "]]"
type = "global-reference"
label = "引用"
tone = "blue"
textColor = "cyan"

[[inlineRules]]
kind = "paired"
open = "<"
close = ">"
type = "local-reference"
label = "条目内块引用"
tone = "teal"
textColor = "teal"

[[inlineRules]]
kind = "single"
marker = "\\\\"
type = "parallel-separator"
label = "并列分隔"
tone = "amber"
textColor = "amber"
`;

export type JournalSyntaxDiagnostic =
  | SyntaxProfileTomlDiagnostic
  | SyntaxProfileSchemaDiagnostic;

export type JournalSyntaxParseResult =
  | { diagnostics: []; profile: CtnSyntaxProfile }
  | { diagnostics: JournalSyntaxDiagnostic[]; profile: null };

function createProtectedRuleDiagnostic(
  path: string,
  message: string,
): SyntaxProfileSchemaDiagnostic {
  return { code: "invalid-fixed-type", message, path };
}

/** Parse and enforce the Journal-specific parts that users cannot remove. */
export function parseJournalSyntaxSource(
  source: string,
): JournalSyntaxParseResult {
  const parsed = parseSyntaxProfileToml(
    source,
    syntaxProfileValidationPolicies.journal,
  );

  if (!parsed.profile) {
    return { diagnostics: parsed.diagnostics, profile: null };
  }
  const diagnostics: SyntaxProfileSchemaDiagnostic[] = [];

  if (parsed.profile.name !== journalSyntaxProfileName) {
    diagnostics.push(createProtectedRuleDiagnostic(
      "$.name",
      `日记语法名称固定为“${journalSyntaxProfileName}”。`,
    ));
  }
  const referenceRules = parsed.profile.inlineRules.filter(
    ({ type }) => type === "global-reference",
  );

  if (referenceRules.length !== 1) {
    diagnostics.push(createProtectedRuleDiagnostic(
      "inlineRules",
      "日记语法必须保留唯一的引用规则。",
    ));
  } else {
    const rule = referenceRules[0];

    if (rule.kind !== "paired" || rule.open !== "[[" || rule.close !== "]]" ) {
      diagnostics.push(createProtectedRuleDiagnostic(
        "inlineRules.global-reference",
        "日记引用规则必须使用受保护的 [[...]] 符号。",
      ));
    }
  }

  return diagnostics.length > 0
    ? { diagnostics, profile: null }
    : { diagnostics: [], profile: parsed.profile };
}

export function requireJournalSyntaxProfile(source: string) {
  const parsed = parseJournalSyntaxSource(source);

  if (!parsed.profile) {
    throw new Error(
      parsed.diagnostics[0]?.message ?? "日记语法配置无效。",
    );
  }
  return parsed.profile;
}

const defaultParsed = parseJournalSyntaxSource(defaultJournalSyntaxSourceV2);

if (!defaultParsed.profile) {
  throw new Error("The built-in Journal syntax source is invalid.");
}

export const defaultJournalCtnSyntaxProfileV2 = defaultParsed.profile;
