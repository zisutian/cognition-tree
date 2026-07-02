// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from "smol-toml";

export const defaultSyntaxProfile = {
  name: "默认 CTN 语法",
  spaceIndentUnit: 4,
  markerRules: [
    {
      marker: "```",
      type: "multiline-block",
      label: "多行块",
      role: "multiline",
      tone: "code",
    },
    {
      marker: ":",
      type: "definition",
      label: "定义",
      role: "normal",
      tone: "green",
    },
    {
      marker: ">",
      type: "personal-understanding",
      label: "理解",
      role: "normal",
      tone: "green",
    },
    {
      marker: "-",
      type: "component",
      label: "组分",
      role: "normal",
      tone: "blue",
    },
  ],
  inlineRules: [
    {
      close: "]]",
      kind: "paired",
      label: "全局概念引用",
      open: "[[",
      tone: "blue",
      type: "global-reference",
    },
    {
      close: "`",
      kind: "paired",
      label: "行内代码",
      open: "`",
      tone: "code",
      type: "inline-code",
    },
    {
      close: ">",
      kind: "paired",
      label: "局部概念引用",
      open: "<",
      tone: "green",
      type: "local-reference",
    },
    {
      kind: "single",
      label: "并列分隔",
      marker: "\\",
      tone: "amber",
      type: "parallel-separator",
    },
  ],
};

const validRoles = new Set(["normal", "multiline"]);
const requiredGlobalReferenceType = "global-reference";
const configurableSyntaxTones = [
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
  "red",
  "amber",
  "gray",
  "code",
];
const validTones = new Set(configurableSyntaxTones);
const customSyntaxTonePattern = /^#[0-9a-fA-F]{6}$/;
const semanticIdPattern = /^[a-z][a-z0-9-]*$/;

const rootFields = new Set([
  "name",
  "spaceIndentUnit",
  "markers",
  "inlineRules",
]);
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

function createDiagnostic(code, path, message, position = {}) {
  return {
    code,
    column: position.column,
    lineNumber: position.lineNumber,
    message,
    path,
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSupportedFields(value, supportedFields, path, diagnostics) {
  for (const key of Object.keys(value)) {
    if (!supportedFields.has(key)) {
      diagnostics.push(
        createDiagnostic("unsupported-field", `${path}.${key}`, `不支持字段 ${key}。`),
      );
    }
  }
}

function readRequiredString(value, key, path, diagnostics) {
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

function readRequiredPositiveInteger(value, key, path, diagnostics) {
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

function formatTomlString(value) {
  return JSON.stringify(value);
}

function isConfigurableSyntaxTone(tone) {
  return validTones.has(tone) || customSyntaxTonePattern.test(tone);
}

function validateSemanticTypeId(value, path, diagnostics) {
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

function readRequiredRole(value, path, diagnostics) {
  const role = readRequiredString(value, "role", path, diagnostics);

  if (!role) {
    return "normal";
  }

  if (!validRoles.has(role)) {
    diagnostics.push(
      createDiagnostic(
        "invalid-field",
        `${path}.role`,
        `role 只能是 ${[...validRoles].join("、")}。`,
      ),
    );
    return "normal";
  }

  return role;
}

function readRequiredTone(value, path, diagnostics) {
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

  return tone;
}

function validateMarkers(value, diagnostics) {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(
      createDiagnostic("invalid-field", "markers", "markers 必须是非空数组。"),
    );
    return [];
  }

  const markers = new Set();
  const markerRules = [];

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
    markerRules.push({ label, marker, role, tone, type });
  });

  return markerRules;
}

function validateInlineRules(value, diagnostics) {
  if (value === undefined) {
    diagnostics.push(
      createDiagnostic("missing-field", "inlineRules", "缺少字段 inlineRules。"),
    );
    return [];
  }

  if (!Array.isArray(value)) {
    diagnostics.push(
      createDiagnostic("invalid-field", "inlineRules", "inlineRules 必须是数组。"),
    );
    return [];
  }

  const inlineRules = [];

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

export function parseSyntaxProfileToml(source) {
  let parsed;

  try {
    parsed = parse(source);
  } catch (error) {
    return {
      diagnostics: [
        createDiagnostic(
          "toml-parse-error",
          "$",
          error instanceof Error ? error.message : "TOML 解析失败。",
          {
            column: typeof error?.column === "number" ? error.column : undefined,
            lineNumber: typeof error?.line === "number" ? error.line : undefined,
          },
        ),
      ],
      profile: null,
    };
  }

  const diagnostics = [];

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
  const spaceIndentUnit = readRequiredPositiveInteger(
    parsed,
    "spaceIndentUnit",
    "$",
    diagnostics,
  );
  const markerRules = validateMarkers(parsed.markers, diagnostics);
  const inlineRules = validateInlineRules(parsed.inlineRules, diagnostics);

  if (
    diagnostics.length > 0 ||
    !name ||
    !spaceIndentUnit ||
    markerRules.length === 0
  ) {
    return { diagnostics, profile: null };
  }

  return {
    diagnostics: [],
    profile: {
      inlineRules,
      markerRules,
      name,
      spaceIndentUnit,
    },
  };
}

export function formatSyntaxProfileToml(profile = defaultSyntaxProfile) {
  const lines = [
    "# CTN 语法配置文件。",
    "# name：界面中显示的人类可读名称。",
    "# spaceIndentUnit：每一层 CTN 树缩进使用的空格数。当前默认值为 4。",
    `name = ${formatTomlString(profile.name)}`,
    `spaceIndentUnit = ${profile.spaceIndentUnit}`,
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
    '# kind = "single"：匹配一个字面量标记。',
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
