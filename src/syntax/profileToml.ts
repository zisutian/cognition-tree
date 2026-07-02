// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from "smol-toml";
import type {
  CtnConceptRule,
  CtnInlineRule,
  CtnMarkerRule,
  CtnRuleRole,
  CtnSyntaxProfile,
  CtnSyntaxTone,
} from "./types";
import { defaultCtnSyntaxProfile } from "./defaultSyntaxProfile";
import {
  configurableSyntaxTones,
  isConfigurableSyntaxTone,
} from "./tones";

export type SyntaxProfileTomlDiagnosticCode =
  | "toml-parse-error"
  | "missing-field"
  | "invalid-field"
  | "unsupported-field"
  | "duplicate-marker"
  | "invalid-type-id"
  | "missing-required-rule";

export type SyntaxProfileTomlDiagnostic = {
  code: SyntaxProfileTomlDiagnosticCode;
  column?: number;
  lineNumber?: number;
  message: string;
  path: string;
};

export type ParseSyntaxProfileTomlResult = {
  diagnostics: SyntaxProfileTomlDiagnostic[];
  profile: CtnSyntaxProfile | null;
};

const validRoles = new Set<CtnRuleRole>(["normal", "multiline"]);
const requiredGlobalReferenceType = "global-reference";
const semanticIdPattern = /^[a-z][a-z0-9-]*$/;
const rootFields = new Set([
  "name",
  "tabDisplayWidth",
  "concept",
  "markers",
  "inlineRules",
]);
const conceptFields = new Set(["type", "label", "tone"]);
const markerFields = new Set(["marker", "type", "label", "role", "tone"]);
const inlineRuleFields = new Set([
  "kind",
  "type",
  "label",
  "tone",
  "open",
  "close",
  "marker",
]);

function createDiagnostic(
  code: SyntaxProfileTomlDiagnosticCode,
  path: string,
  message: string,
  position?: { column?: number; lineNumber?: number },
): SyntaxProfileTomlDiagnostic {
  return {
    code,
    column: position?.column,
    lineNumber: position?.lineNumber,
    message,
    path,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSupportedFields(
  value: Record<string, unknown>,
  supportedFields: Set<string>,
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
) {
  for (const key of Object.keys(value)) {
    if (!supportedFields.has(key)) {
      diagnostics.push(
        createDiagnostic(
          "unsupported-field",
          `${path}.${key}`,
          `不支持字段 ${key}。`,
        ),
      );
    }
  }
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): string | null {
  if (!(key in value)) {
    diagnostics.push(
      createDiagnostic("missing-field", `${path}.${key}`, `缺少字段 ${key}。`),
    );
    return null;
  }

  if (typeof value[key] !== "string" || value[key].trim().length === 0) {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        `${path}.${key}`,
        `${key} 必须是非空字符串。`,
      ),
    );
    return null;
  }

  return value[key].trim();
}

function readRequiredPositiveInteger(
  value: Record<string, unknown>,
  key: string,
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): number | null {
  if (!(key in value)) {
    diagnostics.push(
      createDiagnostic("missing-field", `${path}.${key}`, `缺少字段 ${key}。`),
    );
    return null;
  }

  if (!Number.isInteger(value[key]) || Number(value[key]) < 1) {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        `${path}.${key}`,
        `${key} 必须是正整数。`,
      ),
    );
    return null;
  }

  return Number(value[key]);
}

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function validateSemanticTypeId(
  value: string | null,
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
) {
  if (value && !semanticIdPattern.test(value)) {
    diagnostics.push(
      createDiagnostic(
        "invalid-type-id",
        path,
        `${value} 必须是 ASCII kebab-case 语义 ID。`,
      ),
    );
  }
}

function readRequiredRole(
  value: Record<string, unknown>,
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnRuleRole {
  const role = readRequiredString(value, "role", path, diagnostics);

  if (!role) {
    return "normal";
  }

  if (!validRoles.has(role as CtnRuleRole)) {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        `${path}.role`,
        `role 只能是 ${[...validRoles].join("、")}。`,
      ),
    );
    return "normal";
  }

  return role as CtnRuleRole;
}

function readRequiredTone(
  value: Record<string, unknown>,
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnSyntaxTone {
  const tone = readRequiredString(value, "tone", path, diagnostics);

  if (!tone) {
    return "green";
  }

  if (!isConfigurableSyntaxTone(tone)) {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        `${path}.tone`,
        `tone 只能是 ${configurableSyntaxTones.join("、")} 或 #RRGGBB。`,
      ),
    );
    return "green";
  }

  return tone as CtnSyntaxTone;
}

function validateMarkers(
  value: unknown,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnMarkerRule[] {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        "markers",
        "markers 必须是非空数组。",
      ),
    );
    return [];
  }

  const markers = new Set<string>();
  const markerRules: CtnMarkerRule[] = [];

  value.forEach((markerValue, index) => {
    const path = `markers[${index}]`;

    if (!isRecord(markerValue)) {
      diagnostics.push(
        createDiagnostic("invalid-field", path, "marker rule 必须是对象。"),
      );
      return;
    }

    validateSupportedFields(markerValue, markerFields, path, diagnostics);

    const marker = readRequiredString(markerValue, "marker", path, diagnostics);
    const type = readRequiredString(markerValue, "type", path, diagnostics);
    const label = readRequiredString(markerValue, "label", path, diagnostics);
    const role = readRequiredRole(markerValue, path, diagnostics);
    const tone = readRequiredTone(markerValue, path, diagnostics);

    if (marker && markers.has(marker)) {
      diagnostics.push(
        createDiagnostic(
          "duplicate-marker",
          `${path}.marker`,
          `重复 marker ${marker}。`,
        ),
      );
    }

    validateSemanticTypeId(type, `${path}.type`, diagnostics);

    if (!marker || !type || !label || !semanticIdPattern.test(type)) {
      return;
    }

    markers.add(marker);
    markerRules.push({
      label,
      marker,
      role,
      tone,
      type,
    });
  });

  return markerRules;
}

function validateConcept(
  value: unknown,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnConceptRule | null {
  const path = "concept";

  if (!isRecord(value)) {
    diagnostics.push(
      createDiagnostic("missing-field", path, "缺少顶格概念规则。"),
    );
    return null;
  }

  validateSupportedFields(value, conceptFields, path, diagnostics);

  const type = readRequiredString(value, "type", path, diagnostics);
  const label = readRequiredString(value, "label", path, diagnostics);
  const tone = readRequiredTone(value, path, diagnostics);

  validateSemanticTypeId(type, `${path}.type`, diagnostics);

  if (type !== "concept") {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        `${path}.type`,
        "顶格概念 type 必须是 concept。",
      ),
    );
  }

  if (!type || !label || type !== "concept" || !semanticIdPattern.test(type)) {
    return null;
  }

  return {
    label,
    tone,
    type,
  };
}

function validateInlineRules(
  value: unknown,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnInlineRule[] {
  if (value === undefined) {
    diagnostics.push(
      createDiagnostic(
        "missing-field",
        "inlineRules",
        "缺少字段 inlineRules。",
      ),
    );
    return [];
  }

  if (!Array.isArray(value)) {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        "inlineRules",
        "inlineRules 必须是数组。",
      ),
    );
    return [];
  }

  const inlineRules: CtnInlineRule[] = [];

  value.forEach((ruleValue, index) => {
    const path = `inlineRules[${index}]`;

    if (!isRecord(ruleValue)) {
      diagnostics.push(
        createDiagnostic("invalid-field", path, "inline rule 必须是对象。"),
      );
      return;
    }

    validateSupportedFields(ruleValue, inlineRuleFields, path, diagnostics);

    const kind = readRequiredString(ruleValue, "kind", path, diagnostics);
    const type = readRequiredString(ruleValue, "type", path, diagnostics);
    const label = readRequiredString(ruleValue, "label", path, diagnostics);
    const tone = readRequiredTone(ruleValue, path, diagnostics);

    validateSemanticTypeId(type, `${path}.type`, diagnostics);

    if (!kind || !type || !label || !semanticIdPattern.test(type)) {
      return;
    }

    if (kind === "paired") {
      const open = readRequiredString(ruleValue, "open", path, diagnostics);
      const close = readRequiredString(ruleValue, "close", path, diagnostics);

      if (!open || !close) {
        return;
      }

      inlineRules.push({
        close,
        kind,
        label,
        open,
        tone,
        type,
      });
      return;
    }

    if (kind === "single") {
      const marker = readRequiredString(ruleValue, "marker", path, diagnostics);

      if (!marker) {
        return;
      }

      inlineRules.push({
        kind,
        label,
        marker,
        tone,
        type,
      });
      return;
    }

    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        `${path}.kind`,
        "kind 只能是 paired 或 single。",
      ),
    );
  });

  if (
    !inlineRules.some(
      (rule) =>
        rule.kind === "paired" && rule.type === requiredGlobalReferenceType,
    )
  ) {
    diagnostics.push(
      createDiagnostic(
        "missing-required-rule",
        "inlineRules.global-reference",
        "缺少全局概念引用规则。",
      ),
    );
  }

  return inlineRules;
}

export function parseSyntaxProfileToml(
  source: string,
): ParseSyntaxProfileTomlResult {
  let parsed: unknown;

  try {
    parsed = parse(source);
  } catch (error) {
    const tomlError = error as { column?: unknown; line?: unknown; message?: unknown };

    return {
      diagnostics: [
        createDiagnostic(
          "toml-parse-error",
          "$",
          typeof tomlError.message === "string"
            ? tomlError.message
            : "TOML 解析失败。",
          {
            column:
              typeof tomlError.column === "number" ? tomlError.column : undefined,
            lineNumber:
              typeof tomlError.line === "number" ? tomlError.line : undefined,
          },
        ),
      ],
      profile: null,
    };
  }

  const diagnostics: SyntaxProfileTomlDiagnostic[] = [];

  if (!isRecord(parsed)) {
    return {
      diagnostics: [
        createDiagnostic("invalid-field", "$", "语法配置必须是 TOML 表。"),
      ],
      profile: null,
    };
  }

  validateSupportedFields(parsed, rootFields, "$", diagnostics);

  const name = readRequiredString(parsed, "name", "$", diagnostics);
  const tabDisplayWidth = readRequiredPositiveInteger(
    parsed,
    "tabDisplayWidth",
    "$",
    diagnostics,
  );
  const conceptRule = validateConcept(parsed.concept, diagnostics);
  const markerRules = validateMarkers(parsed.markers, diagnostics);
  const inlineRules = validateInlineRules(parsed.inlineRules, diagnostics);

  if (
    diagnostics.length > 0 ||
    !name ||
    !tabDisplayWidth ||
    !conceptRule ||
    markerRules.length === 0
  ) {
    return {
      diagnostics,
      profile: null,
    };
  }

  return {
    diagnostics: [],
    profile: {
      conceptRule,
      inlineRules,
      markerRules,
      name,
      tabDisplayWidth,
    },
  };
}

export function formatSyntaxProfileToml(
  profile: CtnSyntaxProfile = defaultCtnSyntaxProfile,
): string {
  const lines = [
    "# CTN 语法配置文件。",
    "# name：界面中显示的人类可读名称。",
    "# tabDisplayWidth：一个 Tab 在编辑器中显示为几格宽；CTN 源文件仍使用 Tab 存储层级。",
    `name = ${formatTomlString(profile.name)}`,
    `tabDisplayWidth = ${profile.tabDisplayWidth}`,
    "",
    "# concept：没有行首符号、且位于顶格的概念行规则。",
    "# type 固定为 concept；label 是界面显示名称；tone 是整行高亮颜色。",
    "[concept]",
    `type = ${formatTomlString(profile.conceptRule.type)}`,
    `label = ${formatTomlString(profile.conceptRule.label)}`,
    `tone = ${formatTomlString(profile.conceptRule.tone)}`,
    "",
    "# markers：行首块规则。",
    "# marker：缩进之后匹配的字面量行首标记。",
    "# type：可扩展的语义 ID，使用 ASCII kebab-case。",
    "# label：该规则在界面中显示的名称。",
    '# role：解析行为。"normal" 表示普通块；"multiline" 表示多行块。',
    `# tone：高亮颜色，可选 ${configurableSyntaxTones.join("、")} 或 #RRGGBB。`,
  ];

  for (const markerRule of profile.markerRules) {
    lines.push(
      "",
      "[[markers]]",
      `marker = ${formatTomlString(markerRule.marker)}`,
      `type = ${formatTomlString(markerRule.type)}`,
      `label = ${formatTomlString(markerRule.label)}`,
      `role = ${formatTomlString(markerRule.role)}`,
      `tone = ${formatTomlString(markerRule.tone)}`,
    );
  }

  lines.push(
    "",
    "# inlineRules：普通块内部的行内结构规则。",
    '# kind = "paired"：匹配 open 和 close 之间的文本。',
    '# kind = "single"：用一个字面量标记触发行内结构；显示范围扩展到左右最近空白之间。',
    "# type、label、tone 的含义与 markers 中一致。",
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
    );
  }

  return `${lines.join("\n")}\n`;
}
