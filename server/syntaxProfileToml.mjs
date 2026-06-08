// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from "smol-toml";

export const defaultSyntaxProfile = {
  id: "ctn-default",
  name: "默认 CTN 语法",
  version: 1,
  spaceIndentUnit: 4,
  markerRules: [
    { marker: "```", type: "code", label: "代码块" },
    { marker: ":", type: "definition", label: "定义" },
    { marker: ">", type: "personal-understanding", label: "理解" },
    { marker: "-", type: "component", label: "组分" },
  ],
};

const allowedBlockTypes = new Set([
  "concept",
  "definition",
  "component",
  "personal-understanding",
  "code",
  "text",
]);

const rootFields = new Set(["id", "name", "version", "spaceIndentUnit", "markers"]);
const markerFields = new Set(["marker", "type", "label"]);

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

    if (marker && markers.has(marker)) {
      diagnostics.push(
        createDiagnostic(
          "duplicate-marker",
          `${path}.marker`,
          `重复 marker ${marker}。`,
        ),
      );
    }

    if (type && !allowedBlockTypes.has(type)) {
      diagnostics.push(
        createDiagnostic("unknown-block-type", `${path}.type`, `未知块类型 ${type}。`),
      );
    }

    if (!marker || !type || !label || !allowedBlockTypes.has(type)) {
      return;
    }

    markers.add(marker);
    markerRules.push({ label, marker, type });
  });

  return markerRules;
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

  const id = readRequiredString(parsed, "id", "$", diagnostics);
  const name = readRequiredString(parsed, "name", "$", diagnostics);
  const version = readRequiredPositiveInteger(parsed, "version", "$", diagnostics);
  const spaceIndentUnit = readRequiredPositiveInteger(
    parsed,
    "spaceIndentUnit",
    "$",
    diagnostics,
  );
  const markerRules = validateMarkers(parsed.markers, diagnostics);

  if (
    diagnostics.length > 0 ||
    !id ||
    !name ||
    !version ||
    !spaceIndentUnit ||
    markerRules.length === 0
  ) {
    return { diagnostics, profile: null };
  }

  return {
    diagnostics: [],
    profile: {
      id,
      markerRules,
      name,
      spaceIndentUnit,
      version,
    },
  };
}

export function formatSyntaxProfileToml(profile = defaultSyntaxProfile) {
  const lines = [
    `id = ${formatTomlString(profile.id)}`,
    `name = ${formatTomlString(profile.name)}`,
    `version = ${profile.version}`,
    `spaceIndentUnit = ${profile.spaceIndentUnit}`,
  ];

  for (const markerRule of profile.markerRules) {
    lines.push(
      "",
      "[[markers]]",
      `marker = ${formatTomlString(markerRule.marker)}`,
      `type = ${formatTomlString(markerRule.type)}`,
      `label = ${formatTomlString(markerRule.label)}`,
    );
  }

  return `${lines.join("\n")}\n`;
}
