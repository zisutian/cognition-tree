// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from "smol-toml";
import type {
  CtnConceptRule,
  CtnInlineRule,
  CtnMarkerRule,
  CtnRuleRole,
  CtnSyntaxProfile,
  CtnSyntaxTone,
  CtnTitleRule,
} from "./types";
import {
  validateSyntaxProfile,
  validateSyntaxProfileName,
  validateSyntaxTabDisplayWidth,
  type SyntaxProfileSchemaDiagnostic,
} from "./profileSchema";

export type SyntaxProfileTomlDiagnosticCode =
  | "toml-parse-error"
  | "missing-field"
  | "invalid-field"
  | "unsupported-field"
  | "duplicate-marker"
  | "duplicate-inline-trigger"
  | "duplicate-semantic-id"
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

const rootFields = new Set([
  "name",
  "tabDisplayWidth",
  "title",
  "concept",
  "markers",
  "inlineRules",
]);
const titleFields = new Set(["type", "label", "textColor", "tone"]);
const conceptFields = new Set(["type", "label", "textColor", "tone"]);
const markerFields = new Set([
  "marker",
  "type",
  "label",
  "role",
  "textColor",
  "tone",
]);
const inlineRuleFields = new Set([
  "kind",
  "type",
  "label",
  "textColor",
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

  if (typeof value[key] !== "string") {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        `${path}.${key}`,
        `${key} 必须是字符串。`,
      ),
    );
    return null;
  }

  return value[key].trim();
}

function readRequiredNumber(
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

  if (typeof value[key] !== "number") {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        `${path}.${key}`,
        `${key} 必须是数字。`,
      ),
    );
    return null;
  }

  return Number(value[key]);
}

function readRequiredRole(
  value: Record<string, unknown>,
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnRuleRole | null {
  const role = readRequiredString(value, "role", path, diagnostics);

  if (role === null) {
    return null;
  }

  return role as CtnRuleRole;
}

function readRequiredColor(
  value: Record<string, unknown>,
  key: "textColor" | "tone",
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnSyntaxTone | null {
  const tone = readRequiredString(value, key, path, diagnostics);

  if (tone === null) {
    return null;
  }

  return tone as CtnSyntaxTone;
}

function readRequiredTone(
  value: Record<string, unknown>,
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnSyntaxTone | null {
  return readRequiredColor(value, "tone", path, diagnostics);
}

function readRequiredTextColor(
  value: Record<string, unknown>,
  path: string,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnSyntaxTone | null {
  return readRequiredColor(value, "textColor", path, diagnostics);
}

function validateMarkers(
  value: unknown,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnMarkerRule[] | null {
  if (value === undefined) {
    diagnostics.push(
      createDiagnostic("missing-field", "markers", "缺少字段 markers。"),
    );
    return null;
  }

  if (!Array.isArray(value)) {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        "markers",
        "markers 必须是数组。",
      ),
    );
    return null;
  }

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
    const textColor = readRequiredTextColor(markerValue, path, diagnostics);
    const tone = readRequiredTone(markerValue, path, diagnostics);

    if (
      marker === null ||
      type === null ||
      label === null ||
      role === null ||
      textColor === null ||
      tone === null
    ) {
      return;
    }

    markerRules.push({
      label,
      marker,
      role,
      textColor,
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
  const textColor = readRequiredTextColor(value, path, diagnostics);
  const tone = readRequiredTone(value, path, diagnostics);

  if (
    type === null ||
    label === null ||
    textColor === null ||
    tone === null
  ) {
    return null;
  }

  return {
    label,
    textColor,
    tone,
    type,
  };
}

function validateTitle(
  value: unknown,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnTitleRule | null {
  const path = "title";

  if (!isRecord(value)) {
    diagnostics.push(
      createDiagnostic("missing-field", path, "缺少首行标题规则。"),
    );
    return null;
  }

  validateSupportedFields(value, titleFields, path, diagnostics);

  const type = readRequiredString(value, "type", path, diagnostics);
  const label = readRequiredString(value, "label", path, diagnostics);
  const textColor = readRequiredTextColor(value, path, diagnostics);
  const tone = readRequiredTone(value, path, diagnostics);

  if (
    type === null ||
    label === null ||
    textColor === null ||
    tone === null
  ) {
    return null;
  }

  return {
    label,
    textColor,
    tone,
    type,
  };
}

function validateInlineRules(
  value: unknown,
  diagnostics: SyntaxProfileTomlDiagnostic[],
): CtnInlineRule[] | null {
  if (value === undefined) {
    diagnostics.push(
      createDiagnostic(
        "missing-field",
        "inlineRules",
        "缺少字段 inlineRules。",
      ),
    );
    return null;
  }

  if (!Array.isArray(value)) {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        "inlineRules",
        "inlineRules 必须是数组。",
      ),
    );
    return null;
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
    const textColor = readRequiredTextColor(ruleValue, path, diagnostics);
    const tone = readRequiredTone(ruleValue, path, diagnostics);

    if (
      kind === null ||
      type === null ||
      label === null ||
      textColor === null ||
      tone === null
    ) {
      return;
    }

    if (kind === "paired") {
      const open = readRequiredString(ruleValue, "open", path, diagnostics);
      const close = readRequiredString(ruleValue, "close", path, diagnostics);

      if (open === null || close === null) {
        return;
      }

      inlineRules.push({
        close,
        kind,
        label,
        open,
        textColor,
        tone,
        type,
      });
      return;
    }

    if (kind === "single") {
      const marker = readRequiredString(ruleValue, "marker", path, diagnostics);

      if (marker === null) {
        return;
      }

      inlineRules.push({
        kind,
        label,
        marker,
        textColor,
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

  return inlineRules;
}

function createTomlSchemaDiagnostic(
  diagnostic: SyntaxProfileSchemaDiagnostic,
): SyntaxProfileTomlDiagnostic {
  const code: SyntaxProfileTomlDiagnosticCode = (() => {
    switch (diagnostic.code) {
      case "duplicate-inline-trigger":
      case "duplicate-marker":
      case "duplicate-semantic-id":
        return diagnostic.code;
      case "invalid-semantic-id":
        return "invalid-type-id";
      case "missing-marker-rule":
      case "missing-required-rule":
        return "missing-required-rule";
      default:
        return "invalid-field";
    }
  })();

  return createDiagnostic(code, diagnostic.path, diagnostic.message);
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
  const tabDisplayWidth = readRequiredNumber(
    parsed,
    "tabDisplayWidth",
    "$",
    diagnostics,
  );
  const titleRule = validateTitle(parsed.title, diagnostics);
  const conceptRule = validateConcept(parsed.concept, diagnostics);
  const markerRules = validateMarkers(parsed.markers, diagnostics);
  const inlineRules = validateInlineRules(parsed.inlineRules, diagnostics);

  if (
    name === null ||
    tabDisplayWidth === null ||
    titleRule === null ||
    conceptRule === null ||
    markerRules === null ||
    inlineRules === null
  ) {
    if (name !== null) {
      diagnostics.push(
        ...validateSyntaxProfileName(name).map(createTomlSchemaDiagnostic),
      );
    }

    if (tabDisplayWidth !== null) {
      diagnostics.push(
        ...validateSyntaxTabDisplayWidth(tabDisplayWidth).map(
          createTomlSchemaDiagnostic,
        ),
      );
    }

    return {
      diagnostics,
      profile: null,
    };
  }

  const profile: CtnSyntaxProfile = {
    conceptRule,
    inlineRules,
    markerRules,
    name,
    tabDisplayWidth,
    titleRule,
  };

  diagnostics.push(
    ...validateSyntaxProfile(profile).map(createTomlSchemaDiagnostic),
  );

  if (diagnostics.length > 0) {
    return {
      diagnostics,
      profile: null,
    };
  }

  return {
    diagnostics: [],
    profile,
  };
}
