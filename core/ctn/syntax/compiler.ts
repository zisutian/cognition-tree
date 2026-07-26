// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from "smol-toml";
import {
  ctnSyntaxSchema,
  validateCtnSyntaxDefinition,
  type CtnSyntaxDiagnosticCode,
  type CtnSyntaxSchemaDiagnostic,
} from "./schema.ts";
import type {
  CtnBlockKind,
  CtnBlockRule,
  CtnCompiledSyntax,
  CtnInlineRule,
  CtnSyntaxDefinition,
  CtnSyntaxDisplayRule,
  CtnSyntaxOwner,
  CtnSyntaxTone,
} from "./types.ts";

export type CtnSyntaxDiagnostic = {
  code: CtnSyntaxDiagnosticCode | "toml-parse-error";
  column?: number;
  lineNumber?: number;
  message: string;
  path: string;
};

export type CtnSyntaxCompileResult =
  | {
      definition: CtnSyntaxDefinition;
      diagnostics: [];
      syntax: CtnCompiledSyntax;
    }
  | {
      definition: CtnSyntaxDefinition | null;
      diagnostics: CtnSyntaxDiagnostic[];
      syntax: null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diagnostic(
  code: CtnSyntaxDiagnostic["code"],
  path: string,
  message: string,
): CtnSyntaxDiagnostic {
  return { code, message, path };
}

function unsupportedFields(
  value: Record<string, unknown>,
  supported: ReadonlySet<string>,
  path: string,
  diagnostics: CtnSyntaxDiagnostic[],
) {
  for (const key of Object.keys(value)) {
    if (!supported.has(key)) {
      diagnostics.push(
        diagnostic(
          "forbidden-field",
          path === "$" ? `$.${key}` : `${path}.${key}`,
          `v2 不支持字段 ${key}。`,
        ),
      );
    }
  }
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  diagnostics: CtnSyntaxDiagnostic[],
) {
  const fieldPath = path === "$" ? `$.${key}` : `${path}.${key}`;

  if (!(key in value)) {
    diagnostics.push(diagnostic("missing-field", fieldPath, `缺少字段 ${key}。`));
    return null;
  }
  if (typeof value[key] !== "string") {
    diagnostics.push(
      diagnostic("invalid-field", fieldPath, `${key} 必须是字符串。`),
    );
    return null;
  }
  return value[key];
}

function requiredNumber(
  value: Record<string, unknown>,
  key: string,
  path: string,
  diagnostics: CtnSyntaxDiagnostic[],
) {
  const fieldPath = path === "$" ? `$.${key}` : `${path}.${key}`;

  if (!(key in value)) {
    diagnostics.push(diagnostic("missing-field", fieldPath, `缺少字段 ${key}。`));
    return null;
  }
  if (typeof value[key] !== "number") {
    diagnostics.push(
      diagnostic("invalid-field", fieldPath, `${key} 必须是数字。`),
    );
    return null;
  }
  return value[key];
}

function readStyle(
  value: unknown,
  path: string,
  diagnostics: CtnSyntaxDiagnostic[],
): CtnSyntaxDisplayRule | null {
  if (!isRecord(value)) {
    diagnostics.push(diagnostic("missing-field", path, `缺少 [${path}]。`));
    return null;
  }
  unsupportedFields(
    value,
    new Set(ctnSyntaxSchema.fields.display),
    path,
    diagnostics,
  );
  const label = requiredString(value, "label", path, diagnostics);
  const textColor = requiredString(value, "textColor", path, diagnostics);
  const tone = requiredString(value, "tone", path, diagnostics);

  return label === null || textColor === null || tone === null
    ? null
    : {
        label,
        textColor: textColor as CtnSyntaxTone,
        tone: tone as CtnSyntaxTone,
      };
}

function readBlocks(
  value: unknown,
  diagnostics: CtnSyntaxDiagnostic[],
): CtnBlockRule[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic("missing-field", "blocks", "缺少 [[blocks]] 数组。"),
    );
    return null;
  }
  const blocks: CtnBlockRule[] = [];

  value.forEach((entry, index) => {
    const path = `blocks[${index}]`;

    if (!isRecord(entry)) {
      diagnostics.push(diagnostic("invalid-field", path, "块规则必须是表。"));
      return;
    }
    unsupportedFields(
      entry,
      new Set(ctnSyntaxSchema.fields.block),
      path,
      diagnostics,
    );
    const kind = requiredString(entry, "kind", path, diagnostics);
    const label = requiredString(entry, "label", path, diagnostics);
    const marker = requiredString(entry, "marker", path, diagnostics);
    const semanticId = requiredString(entry, "semanticId", path, diagnostics);
    const textColor = requiredString(entry, "textColor", path, diagnostics);
    const tone = requiredString(entry, "tone", path, diagnostics);

    if (
      kind !== null &&
      label !== null &&
      marker !== null &&
      semanticId !== null &&
      textColor !== null &&
      tone !== null
    ) {
      blocks.push({
        kind: kind as CtnBlockKind,
        label,
        marker,
        semanticId,
        textColor: textColor as CtnSyntaxTone,
        tone: tone as CtnSyntaxTone,
      });
    }
  });
  return blocks;
}

function readInline(
  value: unknown,
  diagnostics: CtnSyntaxDiagnostic[],
): CtnInlineRule[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic("missing-field", "inline", "缺少 [[inline]] 数组。"),
    );
    return null;
  }
  const inline: CtnInlineRule[] = [];

  value.forEach((entry, index) => {
    const path = `inline[${index}]`;

    if (!isRecord(entry)) {
      diagnostics.push(diagnostic("invalid-field", path, "行内规则必须是表。"));
      return;
    }
    const kind = requiredString(entry, "kind", path, diagnostics);
    unsupportedFields(
      entry,
      new Set(
        kind === "paired"
          ? ctnSyntaxSchema.fields.inline.paired
          : kind === "single"
            ? ctnSyntaxSchema.fields.inline.single
            : ["kind", "label", "semanticId", "textColor", "tone"],
      ),
      path,
      diagnostics,
    );
    const label = requiredString(entry, "label", path, diagnostics);
    const semanticId = requiredString(entry, "semanticId", path, diagnostics);
    const textColor = requiredString(entry, "textColor", path, diagnostics);
    const tone = requiredString(entry, "tone", path, diagnostics);

    if (
      kind === null ||
      label === null ||
      semanticId === null ||
      textColor === null ||
      tone === null
    ) return;

    if (kind === "paired") {
      const open = requiredString(entry, "open", path, diagnostics);
      const close = requiredString(entry, "close", path, diagnostics);

      if (open !== null && close !== null) {
        inline.push({
          close,
          kind,
          label,
          open,
          semanticId,
          textColor: textColor as CtnSyntaxTone,
          tone: tone as CtnSyntaxTone,
        });
      }
      return;
    }
    if (kind === "single") {
      const marker = requiredString(entry, "marker", path, diagnostics);

      if (marker !== null) {
        inline.push({
          kind,
          label,
          marker,
          semanticId,
          textColor: textColor as CtnSyntaxTone,
          tone: tone as CtnSyntaxTone,
        });
      }
      return;
    }
    diagnostics.push(
      diagnostic(
        "invalid-field",
        `${path}.kind`,
        "行内 kind 只能是 paired 或 single。",
      ),
    );
  });
  return inline;
}

function codePointLength(value: string) {
  return Array.from(value).length;
}

function inlineTrigger(rule: CtnInlineRule) {
  return rule.kind === "paired" ? rule.open : rule.marker;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freezeRule<T extends object>(rule: T): Readonly<T> {
  return Object.freeze({ ...rule });
}

function createCompiledSyntax(
  definition: CtnSyntaxDefinition,
  owner: CtnSyntaxOwner,
): CtnCompiledSyntax {
  const policy = ctnSyntaxSchema.owners[owner];
  const blocks = Object.freeze(definition.blocks.map(freezeRule));
  const inline = Object.freeze(definition.inline.map(freezeRule));
  const titleStyle = policy.title.source === "required"
    ? definition.title
    : policy.title.syntheticStyle;

  if (!titleStyle) {
    throw new Error(`CTN ${owner} title policy is invalid.`);
  }
  const title = Object.freeze({
    kind: "line" as const,
    marker: null,
    ...titleStyle,
    semanticId: "title" as const,
  });
  const root = policy.root.semanticId && definition.root
    ? Object.freeze({
        kind: "line" as const,
        marker: null,
        ...definition.root,
        semanticId: policy.root.semanticId,
      })
    : null;
  const blockMatcher = Object.freeze(
    [...blocks].sort(
      (left, right) =>
        codePointLength(right.marker) - codePointLength(left.marker),
    ),
  );
  const inlineMatcher = Object.freeze(
    [...inline].sort(
      (left, right) =>
        codePointLength(inlineTrigger(right)) -
        codePointLength(inlineTrigger(left)),
    ),
  );
  const blockGrammarKey = JSON.stringify({
    blocks: blocks
      .map(({ kind, marker, semanticId }) => ({
        kind,
        marker,
        semanticId,
      }))
      .sort((left, right) =>
        compareText(left.marker, right.marker) ||
        compareText(left.semanticId, right.semanticId) ||
        compareText(left.kind, right.kind)
      ),
    owner,
    root: root?.semanticId ?? null,
    title: title.semanticId,
  });
  const inlineGrammarKey = JSON.stringify(
    inline
      .map((rule) =>
        rule.kind === "paired"
          ? {
              close: rule.close,
              kind: rule.kind,
              open: rule.open,
              semanticId: rule.semanticId,
              trigger: rule.open,
            }
          : {
              close: "",
              kind: rule.kind,
              marker: rule.marker,
              semanticId: rule.semanticId,
              trigger: rule.marker,
            })
      .sort((left, right) =>
        compareText(left.trigger, right.trigger) ||
        compareText(left.semanticId, right.semanticId) ||
        compareText(left.kind, right.kind)
      )
      .map(({ trigger: _trigger, ...rule }) => rule),
  );
  const presentationKey = JSON.stringify({
    blocks,
    inline,
    name: definition.name,
    root,
    tabDisplayWidth: definition.tabDisplayWidth,
    title,
  });
  const frozenDefinition = Object.freeze({
    ...definition,
    blocks,
    inline,
    root: definition.root ? freezeRule(definition.root) : null,
    title: definition.title ? freezeRule(definition.title) : null,
  }) as Readonly<CtnSyntaxDefinition>;

  return Object.freeze({
    analysisKey: `${blockGrammarKey}\u0000${inlineGrammarKey}`,
    blockGrammarKey,
    blockMatcher,
    blocks,
    definition: frozenDefinition,
    formatVersion: 2 as const,
    inline,
    inlineGrammarKey,
    inlineMatcher,
    name: definition.name,
    owner,
    presentationKey,
    root,
    tabDisplayWidth: definition.tabDisplayWidth,
    title,
  });
}

function locatePath(
  source: string,
  path: string,
): { column?: number; lineNumber?: number } {
  const lines = source.split("\n");
  const normalized = path.replace(/^\$\./, "");
  const arrayMatch = /^(blocks|inline)\[(\d+)\](?:\.(.+))?$/.exec(normalized);

  if (arrayMatch) {
    const [, section, indexText, field] = arrayMatch;
    const targetIndex = Number(indexText);
    let currentIndex = -1;

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].trim() === `[[${section}]]`) {
        currentIndex += 1;
        if (currentIndex === targetIndex && !field) {
          return { column: 1, lineNumber: index + 1 };
        }
        continue;
      }
      if (
        currentIndex === targetIndex &&
        field &&
        new RegExp(`^\\s*${field}\\s*=`).test(lines[index])
      ) {
        return {
          column: Math.max(1, lines[index].indexOf(field) + 1),
          lineNumber: index + 1,
        };
      }
    }
  }
  const tableMatch = /^(title|root)(?:\.(.+))?$/.exec(normalized);

  if (tableMatch) {
    const [, table, field] = tableMatch;
    let inTable = false;

    for (let index = 0; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();

      if (trimmed === `[${table}]`) {
        if (!field) return { column: 1, lineNumber: index + 1 };
        inTable = true;
        continue;
      }
      if (inTable && trimmed.startsWith("[")) break;
      if (
        inTable &&
        field &&
        new RegExp(`^\\s*${field}\\s*=`).test(lines[index])
      ) {
        return {
          column: Math.max(1, lines[index].indexOf(field) + 1),
          lineNumber: index + 1,
        };
      }
    }
  }
  const rootField = normalized.split(".", 1)[0];

  for (let index = 0; index < lines.length; index += 1) {
    if (new RegExp(`^\\s*${rootField}\\s*=`).test(lines[index])) {
      return {
        column: Math.max(1, lines[index].indexOf(rootField) + 1),
        lineNumber: index + 1,
      };
    }
  }
  return { column: 1, lineNumber: 1 };
}

function withLocations(
  source: string,
  diagnostics: CtnSyntaxSchemaDiagnostic[] | CtnSyntaxDiagnostic[],
) {
  return diagnostics.map((item) => ({
    ...item,
    ...locatePath(source, item.path),
  }));
}

export function compileCtnSyntaxDefinition(
  definition: CtnSyntaxDefinition,
  owner: CtnSyntaxOwner,
): CtnSyntaxCompileResult {
  const diagnostics = validateCtnSyntaxDefinition(definition, owner);

  return diagnostics.length > 0
    ? { definition, diagnostics, syntax: null }
    : {
        definition,
        diagnostics: [],
        syntax: createCompiledSyntax(definition, owner),
      };
}

export function compileCtnSyntaxSource(
  source: string,
  owner: CtnSyntaxOwner,
): CtnSyntaxCompileResult {
  let parsed: unknown;

  try {
    parsed = parse(source);
  } catch (error) {
    const tomlError = error as {
      column?: unknown;
      line?: unknown;
      message?: unknown;
    };

    return {
      definition: null,
      diagnostics: [{
        code: "toml-parse-error",
        column: typeof tomlError.column === "number" ? tomlError.column : 1,
        lineNumber: typeof tomlError.line === "number" ? tomlError.line : 1,
        message: typeof tomlError.message === "string"
          ? tomlError.message
          : "TOML 解析失败。",
        path: "$",
      }],
      syntax: null,
    };
  }

  if (!isRecord(parsed)) {
    return {
      definition: null,
      diagnostics: [
        diagnostic("invalid-field", "$", "语法配置必须是 TOML 表。"),
      ],
      syntax: null,
    };
  }
  const diagnostics: CtnSyntaxDiagnostic[] = [];
  unsupportedFields(
    parsed,
    new Set(ctnSyntaxSchema.fields.topLevel),
    "$",
    diagnostics,
  );
  const formatVersion = requiredNumber(
    parsed,
    "formatVersion",
    "$",
    diagnostics,
  );
  const name = requiredString(parsed, "name", "$", diagnostics);
  const tabDisplayWidth = requiredNumber(
    parsed,
    "tabDisplayWidth",
    "$",
    diagnostics,
  );
  const policy = ctnSyntaxSchema.owners[owner];
  const title = policy.title.source === "required"
    ? readStyle(parsed.title, "title", diagnostics)
    : parsed.title === undefined
      ? null
      : readStyle(parsed.title, "title", diagnostics);
  const root = policy.root.required
    ? readStyle(parsed.root, "root", diagnostics)
    : parsed.root === undefined
      ? null
      : readStyle(parsed.root, "root", diagnostics);
  const blocks = readBlocks(parsed.blocks, diagnostics);
  const inline = readInline(parsed.inline, diagnostics);

  if (
    formatVersion === null ||
    name === null ||
    tabDisplayWidth === null ||
    (policy.title.source === "required" && title === null) ||
    (policy.root.required && root === null) ||
    blocks === null ||
    inline === null
  ) {
    return {
      definition: null,
      diagnostics: withLocations(source, diagnostics),
      syntax: null,
    };
  }
  const definition: CtnSyntaxDefinition = {
    blocks,
    formatVersion: formatVersion as 2,
    inline,
    name,
    root,
    tabDisplayWidth,
    title,
  };
  const validated = compileCtnSyntaxDefinition(definition, owner);
  const combinedDiagnostics = [
    ...diagnostics,
    ...validated.diagnostics,
  ];

  return validated.syntax && combinedDiagnostics.length === 0
    ? validated
    : {
        definition,
        diagnostics: withLocations(source, combinedDiagnostics),
        syntax: null,
      };
}

export function requireCtnSyntax(
  source: string,
  owner: CtnSyntaxOwner,
) {
  const result = compileCtnSyntaxSource(source, owner);

  if (!result.syntax) {
    throw new Error(
      result.diagnostics[0]?.message ?? "CTN 语法配置无效。",
    );
  }
  return result.syntax;
}
