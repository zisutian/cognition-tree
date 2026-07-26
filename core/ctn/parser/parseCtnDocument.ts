// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  CtnSourceText,
} from "../analysis/sourceText.ts";
import {
  createCtnSourceText,
} from "../analysis/sourceText.ts";
import {
  isCtnBlockMetadataDirectiveText,
  parseCtnBlockMetadataLine,
  type CtnBlockMetadataRecord,
} from "../metadata/blockMetadata.ts";
import type {
  CtnCompiledSyntax,
} from "../syntax/types.ts";
import {
  assignBlockSubtreeEndLineNumbers,
  findMultilineRange,
} from "./blockRanges.ts";
import { createDiagnostic } from "./diagnostics.ts";
import { analyzeIndent } from "./indent.ts";
import { parseInlineSpans } from "./inlineSpans.ts";
import { parseMarker } from "./lineMarkers.ts";
import type {
  CtnCanonicalBlock,
  CtnCanonicalDocument,
  CtnDiagnostic,
  CtnEditableBlock,
  CtnEditableDocument,
  CtnFallbackBlockRule,
  CtnMultilineRange,
  CtnResolvedBlockRule,
} from "./types.ts";

type EditableIdentity = {
  kind: "editable";
};

type CanonicalIdentity = {
  createdAt: string;
  id: string;
  kind: "canonical";
  metadataLineNumber: number;
  updatedAt: string;
};

type SourceBlock<TIdentity> = {
  contentIndex: number;
  identity: TIdentity;
  indentText: string;
  line: string;
  lineNumber: number;
  nextIndex: number;
  sourceStartLineNumber: number;
};

type ParsedBlockSeed = {
  contentFingerprint: string;
  diagnostics: CtnDiagnostic[];
  indentText: string;
  inlineSpans: CtnEditableBlock["inlineSpans"];
  level: number;
  lexicalEndLineNumber: number;
  lineNumber: number;
  marker: string | null;
  multilineRange: CtnMultilineRange | null;
  rawText: string;
  rule: Readonly<CtnResolvedBlockRule>;
  subtreeEndLineNumber: number;
  text: string;
  textStartColumn: number;
};

export type CtnDocumentParseMode =
  | { kind: "body"; title: string }
  | { kind: "canonical-document" }
  | { kind: "editable-document" };

export class CtnDocumentMetadataError extends Error {
  lineNumber: number;

  constructor(lineNumber: number, message: string) {
    super(`Invalid CTN block metadata at line ${lineNumber}: ${message}`);
    this.name = "CtnDocumentMetadataError";
    this.lineNumber = lineNumber;
  }
}

function leadingIndentText(line: string) {
  return line.match(/^[\t ]*/)?.[0] ?? "";
}

function readEditableSourceBlock(
  sourceText: CtnSourceText,
  index: number,
): SourceBlock<EditableIdentity> {
  const line = sourceText.values[index] ?? "";
  const lineNumber = index + 1;

  return {
    contentIndex: index,
    identity: { kind: "editable" },
    indentText: leadingIndentText(line),
    line,
    lineNumber,
    nextIndex: index + 1,
    sourceStartLineNumber: lineNumber,
  };
}

function readCanonicalMetadata(
  line: string,
  lineNumber: number,
): CtnBlockMetadataRecord {
  let metadata: CtnBlockMetadataRecord | null;

  try {
    metadata = parseCtnBlockMetadataLine(line);
  } catch (error) {
    throw new CtnDocumentMetadataError(
      lineNumber,
      error instanceof Error ? error.message : "invalid directive",
    );
  }
  if (!metadata) {
    throw new CtnDocumentMetadataError(
      lineNumber,
      "expected @ctn-block directive",
    );
  }
  return metadata;
}

export function readCtnCanonicalTitleHeader(source: string) {
  const sourceText = createCtnSourceText(source);
  const metadata = readCanonicalMetadata(sourceText.values[0] ?? "", 1);

  if (sourceText.values.length < 2) {
    throw new CtnDocumentMetadataError(
      1,
      "metadata directive has no block source line",
    );
  }
  if (metadata.indentText !== "") {
    throw new CtnDocumentMetadataError(
      1,
      "title metadata cannot be indented",
    );
  }
  return {
    metadata,
    title: sourceText.values[1] ?? "",
  };
}

function readCanonicalSourceBlock(
  sourceText: CtnSourceText,
  index: number,
): SourceBlock<CanonicalIdentity> {
  const metadataLineNumber = index + 1;
  const metadata = readCanonicalMetadata(
    sourceText.values[index] ?? "",
    metadataLineNumber,
  );
  const contentIndex = index + 1;
  const line = sourceText.values[contentIndex];

  if (line === undefined) {
    throw new CtnDocumentMetadataError(
      metadataLineNumber,
      "metadata directive has no block source line",
    );
  }
  const indentText = leadingIndentText(line);

  if (metadataLineNumber === 1 && metadata.indentText !== "") {
    throw new CtnDocumentMetadataError(
      metadataLineNumber,
      "title metadata cannot be indented",
    );
  }
  if (metadataLineNumber !== 1 && indentText !== metadata.indentText) {
    throw new CtnDocumentMetadataError(
      metadataLineNumber,
      "metadata indentation does not match its block source line",
    );
  }
  return {
    contentIndex,
    identity: {
      createdAt: metadata.createdAt,
      id: metadata.id,
      kind: "canonical",
      metadataLineNumber,
      updatedAt: metadata.updatedAt,
    },
    indentText,
    line,
    lineNumber: contentIndex + 1,
    nextIndex: contentIndex + 1,
    sourceStartLineNumber: metadataLineNumber,
  };
}

function reservedDirectiveDiagnostic(
  lineNumber: number,
  indentText: string,
) {
  return createDiagnostic(
    "reserved-directive",
    "error",
    lineNumber,
    indentText.length + 1,
    "@ctn-block 是保留指令，不能作为普通块语法使用。",
  );
}

function fallbackRule(
  label: string,
  marker: string | null,
): Readonly<CtnFallbackBlockRule> {
  return Object.freeze({
    kind: "line",
    label,
    marker,
    semanticId: "text",
    textColor: "default",
    tone: "default",
  });
}

const unknownSyntaxRule = fallbackRule("未知语法", null);
const reservedRule = fallbackRule("保留指令", null);
const unmarkedRule = fallbackRule("无符号正文", null);

function titleSeed(
  sourceBlock: SourceBlock<EditableIdentity | CanonicalIdentity>,
  syntax: CtnCompiledSyntax,
): ParsedBlockSeed {
  const { indentText, line, lineNumber } = sourceBlock;
  const trimmed = line.trim();
  const indent = analyzeIndent(indentText, lineNumber);
  const parsedMarker = trimmed
    ? parseMarker(
        trimmed,
        lineNumber,
        indentText.length,
        syntax.blockMatcher,
      )
    : null;
  const diagnostics: CtnDiagnostic[] = [...indent.diagnostics];
  const isReservedDirective = isCtnBlockMetadataDirectiveText(trimmed);

  if (isReservedDirective) {
    diagnostics.push(reservedDirectiveDiagnostic(lineNumber, indentText));
  }
  if (!trimmed) {
    diagnostics.push(
      createDiagnostic(
        "title-line-invalid",
        "error",
        lineNumber,
        1,
        "首行标题不能为空。",
      ),
    );
  } else if (indent.level > 0 || indentText.length > 0) {
    diagnostics.push(
      createDiagnostic(
        "title-line-invalid",
        "error",
        lineNumber,
        1,
        "首行标题必须顶格书写。",
      ),
    );
  } else if (parsedMarker?.marker !== null) {
    diagnostics.push(
      createDiagnostic(
        "title-line-invalid",
        "error",
        lineNumber,
        1,
        "首行标题不能使用行首符号。",
      ),
    );
  }
  const textStartColumn = indentText.length + 1;

  return {
    contentFingerprint: line,
    diagnostics,
    indentText,
    inlineSpans: trimmed && !isReservedDirective
      ? parseInlineSpans(
          trimmed,
          lineNumber,
          textStartColumn,
          syntax.inlineMatcher,
        )
      : [],
    level: 0,
    lexicalEndLineNumber: lineNumber,
    lineNumber,
    marker: null,
    multilineRange: null,
    rawText: line,
    rule: syntax.title,
    subtreeEndLineNumber: lineNumber,
    text: trimmed,
    textStartColumn,
  };
}

function multilineLexicalEnd(range: CtnMultilineRange) {
  return range.closingFenceLineNumber ?? range.contentEndLineNumber;
}

function regularSeed(
  sourceText: CtnSourceText,
  sourceBlock: SourceBlock<EditableIdentity | CanonicalIdentity>,
  syntax: CtnCompiledSyntax,
): ParsedBlockSeed {
  const {
    contentIndex,
    indentText,
    line,
    lineNumber,
    sourceStartLineNumber,
  } = sourceBlock;
  const trimmed = line.slice(indentText.length).trim();

  if (!trimmed) {
    throw new CtnDocumentMetadataError(
      sourceStartLineNumber,
      "metadata directive must precede a non-empty block source line",
    );
  }
  const indent = analyzeIndent(indentText, lineNumber);
  const isReservedDirective = isCtnBlockMetadataDirectiveText(trimmed);
  const parsedMarker = isReservedDirective
    ? {
        diagnostics: [reservedDirectiveDiagnostic(lineNumber, indentText)],
        marker: null,
        rule: null,
        text: trimmed,
        textStartColumn: indentText.length + 1,
      }
    : parseMarker(
        trimmed,
        lineNumber,
        indentText.length,
        syntax.blockMatcher,
      );
  const isUnmarked = parsedMarker.marker === null;
  const rootRule =
    !isReservedDirective && indentText.length === 0 && isUnmarked
      ? syntax.root
      : null;
  const isUnknown =
    !isReservedDirective &&
    isUnmarked &&
    (indentText.length > 0 || rootRule === null);
  const diagnostics = [
    ...indent.diagnostics,
    ...parsedMarker.diagnostics,
  ];

  if (isUnknown) {
    diagnostics.push(
      createDiagnostic(
        "unknown-syntax",
        "warning",
        lineNumber,
        indentText.length + 1,
        indentText.length > 0
          ? "缩进行必须使用已配置的行首符号。"
          : "当前语法要求正文行使用已配置的行首符号。",
      ),
    );
  }
  const resolvedRule: Readonly<CtnResolvedBlockRule> = isReservedDirective
    ? reservedRule
    : isUnknown
      ? unknownSyntaxRule
      : rootRule ?? parsedMarker.rule ?? unmarkedRule;
  const multilineRange =
    resolvedRule.kind === "multiline" && parsedMarker.marker !== null
      ? findMultilineRange(
          sourceText.values,
          contentIndex,
          indentText,
          parsedMarker.marker,
        )
      : null;
  const lexicalEndLineNumber = multilineRange
    ? multilineLexicalEnd(multilineRange)
    : lineNumber;

  if (multilineRange?.status === "unterminated") {
    diagnostics.push(
      createDiagnostic(
        "unterminated-multiline-block",
        "error",
        lineNumber,
        indentText.length + 1,
        `多行块缺少同缩进的 ${parsedMarker.marker} 结束行。`,
      ),
    );
  }
  return {
    contentFingerprint: sourceText.values
      .slice(contentIndex, lexicalEndLineNumber)
      .join("\n"),
    diagnostics,
    indentText,
    inlineSpans:
      resolvedRule.kind === "multiline" ||
        isUnknown ||
        isReservedDirective
        ? []
        : parseInlineSpans(
            parsedMarker.text,
            lineNumber,
            parsedMarker.textStartColumn,
            syntax.inlineMatcher,
          ),
    level: indent.level,
    lexicalEndLineNumber,
    lineNumber,
    marker: parsedMarker.marker,
    multilineRange,
    rawText: line,
    rule: resolvedRule,
    subtreeEndLineNumber: lexicalEndLineNumber,
    text: parsedMarker.text,
    textStartColumn: parsedMarker.textStartColumn,
  };
}

function editableBlock(seed: ParsedBlockSeed): CtnEditableBlock {
  return {
    ...seed,
    children: [],
  };
}

function canonicalBlock(
  seed: ParsedBlockSeed,
  identity: CanonicalIdentity,
): CtnCanonicalBlock {
  return {
    ...seed,
    children: [],
    id: identity.id,
    metadata: {
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
    },
    metadataLineNumber: identity.metadataLineNumber,
  };
}

function parseEditable(
  sourceText: CtnSourceText,
  syntax: CtnCompiledSyntax,
  mode: "body" | "editable-document",
): CtnEditableDocument {
  const roots: CtnEditableBlock[] = [];
  const blocks: CtnEditableBlock[] = [];
  const diagnostics: CtnDiagnostic[] = [];
  const stack: Array<{ level: number; node: CtnEditableBlock }> = [];
  const sourceStartLineNumberByBlock = new Map<CtnEditableBlock, number>();
  let index = 0;

  if (mode === "editable-document") {
    const sourceBlock = readEditableSourceBlock(sourceText, 0);
    const node = editableBlock(titleSeed(sourceBlock, syntax));

    roots.push(node);
    blocks.push(node);
    diagnostics.push(...node.diagnostics);
    sourceStartLineNumberByBlock.set(node, sourceBlock.sourceStartLineNumber);
    index = sourceBlock.nextIndex;
  }
  while (index < sourceText.values.length) {
    if (!(sourceText.values[index] ?? "").trim()) {
      index += 1;
      continue;
    }
    const sourceBlock = readEditableSourceBlock(sourceText, index);
    const node = editableBlock(regularSeed(sourceText, sourceBlock, syntax));

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    const parent = stack.at(-1)?.node;

    if (!parent && node.level > 0) {
      node.diagnostics.push(
        createDiagnostic(
          "indent-level-jump",
          "warning",
          node.lineNumber,
          1,
          "当前行存在缩进，但前面没有可作为父级的块。",
        ),
      );
    }
    if (parent && node.level > parent.level + 1) {
      node.diagnostics.push(
        createDiagnostic(
          "indent-level-jump",
          "warning",
          node.lineNumber,
          1,
          "缩进层级跳跃，可能缺少中间父级块。",
        ),
      );
    }
    if (parent) parent.children.push(node);
    else roots.push(node);
    blocks.push(node);
    diagnostics.push(...node.diagnostics);
    sourceStartLineNumberByBlock.set(node, sourceBlock.sourceStartLineNumber);
    stack.push({ level: node.level, node });
    index = node.multilineRange
      ? node.multilineRange.closingFenceLineNumber ?? sourceText.values.length
      : sourceBlock.nextIndex;
  }
  assignBlockSubtreeEndLineNumbers(
    blocks,
    sourceText.values.length,
    (block) => sourceStartLineNumberByBlock.get(block) ?? block.lineNumber,
  );
  return { blocks, diagnostics, roots };
}

function assertValidBodyTitle(
  title: string,
  syntax: CtnCompiledSyntax,
) {
  if (!title.trim() || title.includes("\n") || title.includes("\r")) {
    throw new Error("CTN body title must be one non-empty line");
  }
  const virtualTitle = titleSeed(
    readEditableSourceBlock(createCtnSourceText(title), 0),
    syntax,
  );

  if (virtualTitle.diagnostics.length > 0) {
    throw new Error("CTN body title must be a valid CTN title line");
  }
}

function parseCanonical(
  sourceText: CtnSourceText,
  syntax: CtnCompiledSyntax,
): CtnCanonicalDocument {
  const roots: CtnCanonicalBlock[] = [];
  const blocks: CtnCanonicalBlock[] = [];
  const diagnostics: CtnDiagnostic[] = [];
  const stack: Array<{ level: number; node: CtnCanonicalBlock }> = [];
  const sourceStartLineNumberByBlock = new Map<CtnCanonicalBlock, number>();
  const titleSourceBlock = readCanonicalSourceBlock(sourceText, 0);
  const titleNode = canonicalBlock(
    titleSeed(titleSourceBlock, syntax),
    titleSourceBlock.identity,
  );

  roots.push(titleNode);
  blocks.push(titleNode);
  diagnostics.push(...titleNode.diagnostics);
  sourceStartLineNumberByBlock.set(
    titleNode,
    titleSourceBlock.sourceStartLineNumber,
  );
  let index = titleSourceBlock.nextIndex;

  while (index < sourceText.values.length) {
    if (!(sourceText.values[index] ?? "").trim()) {
      index += 1;
      continue;
    }
    const sourceBlock = readCanonicalSourceBlock(sourceText, index);
    const node = canonicalBlock(
      regularSeed(sourceText, sourceBlock, syntax),
      sourceBlock.identity,
    );

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    const parent = stack.at(-1)?.node;

    if (!parent && node.level > 0) {
      node.diagnostics.push(
        createDiagnostic(
          "indent-level-jump",
          "warning",
          node.lineNumber,
          1,
          "当前行存在缩进，但前面没有可作为父级的块。",
        ),
      );
    }
    if (parent && node.level > parent.level + 1) {
      node.diagnostics.push(
        createDiagnostic(
          "indent-level-jump",
          "warning",
          node.lineNumber,
          1,
          "缩进层级跳跃，可能缺少中间父级块。",
        ),
      );
    }
    if (parent) parent.children.push(node);
    else roots.push(node);
    blocks.push(node);
    diagnostics.push(...node.diagnostics);
    sourceStartLineNumberByBlock.set(node, sourceBlock.sourceStartLineNumber);
    stack.push({ level: node.level, node });
    index = node.multilineRange
      ? node.multilineRange.closingFenceLineNumber ?? sourceText.values.length
      : sourceBlock.nextIndex;
  }
  assignBlockSubtreeEndLineNumbers(
    blocks,
    sourceText.values.length,
    (block) => sourceStartLineNumberByBlock.get(block) ?? block.lineNumber,
  );
  const ids = new Set<string>();

  for (const block of blocks) {
    if (ids.has(block.id)) {
      throw new CtnDocumentMetadataError(
        block.metadataLineNumber,
        `duplicate block id ${block.id}`,
      );
    }
    ids.add(block.id);
  }
  return { blocks, diagnostics, roots };
}

export function parseCtnSourceText(
  sourceText: CtnSourceText,
  syntax: CtnCompiledSyntax,
  mode: { kind: "canonical-document" },
): CtnCanonicalDocument;
export function parseCtnSourceText(
  sourceText: CtnSourceText,
  syntax: CtnCompiledSyntax,
  mode:
    | { kind: "body"; title: string }
    | { kind: "editable-document" },
): CtnEditableDocument;
export function parseCtnSourceText(
  sourceText: CtnSourceText,
  syntax: CtnCompiledSyntax,
  mode: CtnDocumentParseMode,
): CtnCanonicalDocument | CtnEditableDocument {
  if (mode.kind === "canonical-document") {
    return parseCanonical(sourceText, syntax);
  }
  if (mode.kind === "body") {
    assertValidBodyTitle(mode.title, syntax);
    return parseEditable(sourceText, syntax, "body");
  }
  return parseEditable(sourceText, syntax, "editable-document");
}
