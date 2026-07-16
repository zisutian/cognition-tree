import {
  isCtnBlockMetadataDirectiveText,
  parseCtnBlockMetadataLine,
  type CtnBlockMetadataRecord,
} from "../metadata/blockMetadata";
import type { CtnSyntaxProfile } from "../syntax/types";
import {
  assignBlockSubtreeEndLineNumbers,
  findMultilineRange,
} from "./blockRanges";
import { createDiagnostic } from "./diagnostics";
import { analyzeIndent } from "./indent";
import { parseInlineSpans } from "./inlineSpans";
import { parseMarker, sortMarkerRules } from "./lineMarkers";
import type {
  CtnCanonicalBlock,
  CtnCanonicalDocument,
  CtnDiagnostic,
  CtnEditableBlock,
  CtnEditableDocument,
  CtnMultilineRange,
} from "./types";

type CtnSourceBlock<TIdentity extends object> = {
  contentIndex: number;
  identity: TIdentity;
  indentText: string;
  line: string;
  lineNumber: number;
  nextIndex: number;
  sourceStartLineNumber: number;
};

type ReadCtnSourceBlock<TIdentity extends object> = (
  lines: string[],
  index: number,
) => CtnSourceBlock<TIdentity>;

type CanonicalBlockIdentity = {
  id: string;
  metadata: {
    createdAt: string;
    updatedAt: string;
  };
  metadataLineNumber: number;
};

export class CtnDocumentMetadataError extends Error {
  lineNumber: number;

  constructor(lineNumber: number, message: string) {
    super(`Invalid CTN block metadata at line ${lineNumber}: ${message}`);
    this.name = "CtnDocumentMetadataError";
    this.lineNumber = lineNumber;
  }
}

function readEditableSourceBlock(
  lines: string[],
  index: number,
): CtnSourceBlock<Record<never, never>> {
  const line = lines[index] ?? "";
  const lineNumber = index + 1;

  return {
    contentIndex: index,
    identity: {},
    indentText: line.match(/^\s*/)?.[0] ?? "",
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
  const lines = source.split("\n");
  const metadata = readCanonicalMetadata(lines[0] ?? "", 1);

  if (lines.length < 2) {
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
    title: lines[1],
  };
}

function readCanonicalSourceBlock(
  lines: string[],
  index: number,
): CtnSourceBlock<CanonicalBlockIdentity> {
  const metadataLineNumber = index + 1;
  const metadata = readCanonicalMetadata(
    lines[index] ?? "",
    metadataLineNumber,
  );
  const contentIndex = index + 1;
  const line = lines[contentIndex];

  if (line === undefined) {
    throw new CtnDocumentMetadataError(
      metadataLineNumber,
      "metadata directive has no block source line",
    );
  }

  const indentText = line.match(/^\s*/)?.[0] ?? "";

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
      id: metadata.id,
      metadata: {
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
      },
      metadataLineNumber,
    },
    indentText,
    line,
    lineNumber: contentIndex + 1,
    nextIndex: contentIndex + 1,
    sourceStartLineNumber: metadataLineNumber,
  };
}

function createReservedDirectiveDiagnostic(
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

function createTitleBlock<TBlock extends CtnEditableBlock>({
  markerRules,
  sourceBlock,
  syntaxProfile,
}: {
  markerRules: ReturnType<typeof sortMarkerRules>;
  sourceBlock: CtnSourceBlock<object>;
  syntaxProfile: CtnSyntaxProfile;
}): TBlock {
  const { identity, indentText, line, lineNumber } = sourceBlock;
  const trimmed = line.trim();
  const indent = analyzeIndent(indentText, lineNumber);
  const parsedMarker = trimmed
    ? parseMarker(trimmed, lineNumber, indentText.length, markerRules)
    : null;
  const diagnostics: CtnDiagnostic[] = [...indent.diagnostics];
  const isReservedDirective = isCtnBlockMetadataDirectiveText(trimmed);

  if (isReservedDirective) {
    diagnostics.push(
      createReservedDirectiveDiagnostic(lineNumber, indentText),
    );
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
    ...identity,
    children: [],
    contentFingerprint: line,
    diagnostics,
    indentText,
    inlineSpans:
      trimmed && !isReservedDirective
        ? parseInlineSpans(
            trimmed,
            lineNumber,
            textStartColumn,
            syntaxProfile.inlineRules,
          )
        : [],
    label: syntaxProfile.titleRule.label,
    level: 0,
    lexicalEndLineNumber: lineNumber,
    lineNumber,
    marker: null,
    multilineRange: null,
    rawText: line,
    role: "normal",
    subtreeEndLineNumber: lineNumber,
    text: trimmed,
    textColor: syntaxProfile.titleRule.textColor,
    textStartColumn,
    tone: syntaxProfile.titleRule.tone,
    type: syntaxProfile.titleRule.type,
  } as unknown as TBlock;
}

function getMultilineLexicalEndLineNumber(
  multilineRange: CtnMultilineRange,
) {
  return multilineRange.closingFenceLineNumber ?? multilineRange.contentEndLineNumber;
}

function parseDocument<TBlock extends CtnEditableBlock>(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
  readSourceBlock: ReadCtnSourceBlock<object>,
): {
  blocks: TBlock[];
  diagnostics: CtnDiagnostic[];
  roots: TBlock[];
} {
  const lines = source.split("\n");
  const roots: TBlock[] = [];
  const blocks: TBlock[] = [];
  const diagnostics: CtnDiagnostic[] = [];
  const stack: Array<{ level: number; node: TBlock }> = [];
  const markerRules = sortMarkerRules(syntaxProfile.markerRules);
  const sourceStartLineNumberByBlock = new Map<TBlock, number>();
  const titleSourceBlock = readSourceBlock(lines, 0);
  const titleBlock = createTitleBlock<TBlock>({
    markerRules,
    sourceBlock: titleSourceBlock,
    syntaxProfile,
  });

  roots.push(titleBlock);
  blocks.push(titleBlock);
  diagnostics.push(...titleBlock.diagnostics);
  sourceStartLineNumberByBlock.set(
    titleBlock,
    titleSourceBlock.sourceStartLineNumber,
  );
  let index = titleSourceBlock.nextIndex;

  while (index < lines.length) {
    if (!(lines[index] ?? "").trim()) {
      index += 1;
      continue;
    }

    const sourceBlock = readSourceBlock(lines, index);
    const {
      contentIndex,
      identity,
      indentText,
      line,
      lineNumber,
      sourceStartLineNumber,
    } = sourceBlock;
    const trimmed = line.trim();

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
          diagnostics: [
            createReservedDirectiveDiagnostic(lineNumber, indentText),
          ],
          label: "保留指令",
          marker: null,
          role: "normal" as const,
          text: trimmed,
          textColor: "default" as const,
          textStartColumn: indentText.length + 1,
          tone: "default" as const,
          type: "text",
        }
      : parseMarker(
          trimmed,
          lineNumber,
          indentText.length,
          markerRules,
        );
    const isUnmarkedLine =
      parsedMarker.marker === null && parsedMarker.type === "concept";
    const isTopLevelConcept = indentText.length === 0 && isUnmarkedLine;
    const isUnknownIndentedSyntax =
      !isReservedDirective && indentText.length > 0 && isUnmarkedLine;
    const nodeDiagnostics = [
      ...indent.diagnostics,
      ...parsedMarker.diagnostics,
    ];

    if (isUnknownIndentedSyntax) {
      nodeDiagnostics.push(
        createDiagnostic(
          "unknown-syntax",
          "warning",
          lineNumber,
          indentText.length + 1,
          "缩进行必须使用已配置的行首符号。",
        ),
      );
    }

    const multilineRange =
      parsedMarker.role === "multiline" && parsedMarker.marker !== null
        ? findMultilineRange(
            lines,
            contentIndex,
            indentText,
            parsedMarker.marker,
          )
        : null;
    const lexicalEndLineNumber = multilineRange
      ? getMultilineLexicalEndLineNumber(multilineRange)
      : lineNumber;

    if (multilineRange?.status === "unterminated") {
      nodeDiagnostics.push(
        createDiagnostic(
          "unterminated-multiline-block",
          "error",
          lineNumber,
          indentText.length + 1,
          `多行块缺少同缩进的 ${parsedMarker.marker} 结束行。`,
        ),
      );
    }

    const node = {
      ...identity,
      children: [],
      contentFingerprint: lines
        .slice(contentIndex, lexicalEndLineNumber)
        .join("\n"),
      diagnostics: nodeDiagnostics,
      indentText,
      inlineSpans:
        parsedMarker.role === "multiline" ||
        isUnknownIndentedSyntax ||
        isReservedDirective
          ? []
          : parseInlineSpans(
              parsedMarker.text,
              lineNumber,
              parsedMarker.textStartColumn,
              syntaxProfile.inlineRules,
            ),
      label: isReservedDirective
        ? parsedMarker.label
        : isUnknownIndentedSyntax
          ? "未知语法"
          : isTopLevelConcept
            ? syntaxProfile.conceptRule.label
            : parsedMarker.label,
      level: indent.level,
      lexicalEndLineNumber,
      lineNumber,
      marker: parsedMarker.marker,
      multilineRange,
      rawText: line,
      role: parsedMarker.role,
      subtreeEndLineNumber: lexicalEndLineNumber,
      text: parsedMarker.text,
      textColor: isTopLevelConcept
        ? syntaxProfile.conceptRule.textColor
        : parsedMarker.textColor,
      textStartColumn: parsedMarker.textStartColumn,
      tone: isTopLevelConcept
        ? syntaxProfile.conceptRule.tone
        : parsedMarker.tone,
      type: isReservedDirective
        ? "text"
        : isUnknownIndentedSyntax
          ? "text"
          : isTopLevelConcept
            ? syntaxProfile.conceptRule.type
            : parsedMarker.type,
    } as unknown as TBlock;

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.node;
    if (!parent && node.level > 0) {
      node.diagnostics.push(
        createDiagnostic(
          "indent-level-jump",
          "warning",
          lineNumber,
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
          lineNumber,
          1,
          "缩进层级跳跃，可能缺少中间父级块。",
        ),
      );
    }

    if (parent) {
      (parent.children as TBlock[]).push(node);
    } else {
      roots.push(node);
    }

    blocks.push(node);
    diagnostics.push(...node.diagnostics);
    sourceStartLineNumberByBlock.set(node, sourceStartLineNumber);
    stack.push({ level: node.level, node });

    index = multilineRange
      ? multilineRange.closingFenceLineNumber ?? lines.length
      : sourceBlock.nextIndex;
  }

  assignBlockSubtreeEndLineNumbers(
    blocks,
    lines.length,
    (block) => sourceStartLineNumberByBlock.get(block) ?? block.lineNumber,
  );

  return { roots, blocks, diagnostics };
}

function assertUniqueCanonicalBlockIds(document: CtnCanonicalDocument) {
  const blockIds = new Set<string>();

  for (const block of document.blocks) {
    if (blockIds.has(block.id)) {
      throw new CtnDocumentMetadataError(
        block.metadataLineNumber,
        `duplicate block id ${block.id}`,
      );
    }

    blockIds.add(block.id);
  }
}

export function parseCtnEditableDocument(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
): CtnEditableDocument {
  return parseDocument<CtnEditableBlock>(
    source,
    syntaxProfile,
    readEditableSourceBlock,
  );
}

export function parseCtnCanonicalDocument(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
): CtnCanonicalDocument {
  const document = parseDocument<CtnCanonicalBlock>(
    source,
    syntaxProfile,
    readCanonicalSourceBlock,
  );

  assertUniqueCanonicalBlockIds(document);
  return document;
}
