import {
  parseCtnBlockMetadataLine,
  type CtnBlockMetadataRecord,
} from "../metadata/blockMetadata";
import type { CtnSyntaxProfile } from "../syntax/types";
import {
  assignBlockEndLineNumbers,
  findClosingMultilineFenceLineNumber,
} from "./blockRanges";
import { createDiagnostic } from "./diagnostics";
import { analyzeIndent } from "./indent";
import { parseInlineSpans } from "./inlineSpans";
import { parseMarker, sortMarkerRules } from "./lineMarkers";
import type {
  CtnBlock,
  CtnDiagnostic,
  CtnDocument,
} from "./types";

type BlockMetadataPolicy = "legacy-initialization" | "required";

type CtnSourceBlock = {
  contentIndex: number;
  indentText: string;
  line: string;
  lineNumber: number;
  metadata: CtnBlockMetadataRecord;
  metadataLineNumber: number;
  nextIndex: number;
};

const legacyMetadataTimestamp = "1970-01-01T00:00:00.000Z";

export class CtnDocumentMetadataError extends Error {
  lineNumber: number;

  constructor(lineNumber: number, message: string) {
    super(`Invalid CTN block metadata at line ${lineNumber}: ${message}`);
    this.name = "CtnDocumentMetadataError";
    this.lineNumber = lineNumber;
  }
}

function createLegacyBlockId(lineNumber: number) {
  return `00000000-0000-0000-0000-${String(lineNumber).padStart(12, "0")}`;
}

function readSourceBlock({
  index,
  lines,
  metadataPolicy,
}: {
  index: number;
  lines: string[];
  metadataPolicy: BlockMetadataPolicy;
}): CtnSourceBlock {
  if (metadataPolicy === "legacy-initialization") {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    const indentText = line.match(/^\s*/)?.[0] ?? "";

    return {
      contentIndex: index,
      indentText,
      line,
      lineNumber,
      metadata: {
        createdAt: legacyMetadataTimestamp,
        id: createLegacyBlockId(lineNumber),
        indentText,
        updatedAt: legacyMetadataTimestamp,
      },
      metadataLineNumber: lineNumber,
      nextIndex: index + 1,
    };
  }

  const metadataLine = lines[index] ?? "";
  const metadataLineNumber = index + 1;
  let metadata: CtnBlockMetadataRecord | null;

  try {
    metadata = parseCtnBlockMetadataLine(metadataLine);
  } catch (error) {
    throw new CtnDocumentMetadataError(
      metadataLineNumber,
      error instanceof Error ? error.message : "invalid directive",
    );
  }

  if (!metadata) {
    throw new CtnDocumentMetadataError(
      metadataLineNumber,
      "expected @ctn-block directive",
    );
  }

  const contentIndex = index + 1;
  const line = lines[contentIndex];

  if (line === undefined) {
    throw new CtnDocumentMetadataError(
      metadataLineNumber,
      "metadata directive has no block source line",
    );
  }

  const indentText = line.match(/^\s*/)?.[0] ?? "";

  if (indentText !== metadata.indentText) {
    throw new CtnDocumentMetadataError(
      metadataLineNumber,
      "metadata indentation does not match its block source line",
    );
  }

  return {
    contentIndex,
    indentText,
    line,
    lineNumber: contentIndex + 1,
    metadata,
    metadataLineNumber,
    nextIndex: contentIndex + 1,
  };
}

function createTitleBlock({
  markerRules,
  sourceBlock,
  syntaxProfile,
}: {
  markerRules: ReturnType<typeof sortMarkerRules>;
  sourceBlock: CtnSourceBlock;
  syntaxProfile: CtnSyntaxProfile;
}): CtnBlock {
  const {
    indentText,
    line,
    lineNumber,
    metadata,
    metadataLineNumber,
  } = sourceBlock;
  const trimmed = line.trim();
  const indent = analyzeIndent(indentText, lineNumber);
  const parsedMarker = trimmed
    ? parseMarker(trimmed, lineNumber, indentText.length, markerRules)
    : null;
  const diagnostics: CtnDiagnostic[] = [...indent.diagnostics];

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
    children: [],
    diagnostics,
    endLineNumber: lineNumber,
    id: metadata.id,
    indentText,
    inlineSpans: trimmed
      ? parseInlineSpans(
          trimmed,
          lineNumber,
          textStartColumn,
          syntaxProfile.inlineRules,
        )
      : [],
    label: syntaxProfile.titleRule.label,
    level: 0,
    lineNumber,
    marker: null,
    metadata: {
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    },
    metadataLineNumber,
    rawText: line,
    role: "normal",
    text: trimmed,
    textColor: syntaxProfile.titleRule.textColor,
    tone: syntaxProfile.titleRule.tone,
    type: syntaxProfile.titleRule.type,
  };
}

function parseDocument(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
  metadataPolicy: BlockMetadataPolicy,
): CtnDocument {
  const lines = source.split("\n");
  const roots: CtnBlock[] = [];
  const blocks: CtnBlock[] = [];
  const diagnostics: CtnDiagnostic[] = [];
  const stack: Array<{ level: number; node: CtnBlock }> = [];
  const markerRules = sortMarkerRules(syntaxProfile.markerRules);
  const titleSourceBlock = readSourceBlock({
    index: 0,
    lines,
    metadataPolicy,
  });
  const titleBlock = createTitleBlock({
    markerRules,
    sourceBlock: titleSourceBlock,
    syntaxProfile,
  });
  const blockIds = new Set([titleBlock.id]);

  roots.push(titleBlock);
  blocks.push(titleBlock);
  diagnostics.push(...titleBlock.diagnostics);
  let index = titleSourceBlock.nextIndex;

  while (index < lines.length) {
    const candidateLine = lines[index];

    if (!candidateLine.trim()) {
      index += 1;
      continue;
    }

    const sourceBlock = readSourceBlock({ index, lines, metadataPolicy });
    const {
      contentIndex,
      indentText,
      line,
      lineNumber,
      metadata,
      metadataLineNumber,
    } = sourceBlock;
    const trimmed = line.trim();

    if (!trimmed) {
      throw new CtnDocumentMetadataError(
        metadataLineNumber,
        "metadata directive must precede a non-empty block source line",
      );
    }

    if (blockIds.has(metadata.id)) {
      throw new CtnDocumentMetadataError(
        metadataLineNumber,
        `duplicate block id ${metadata.id}`,
      );
    }

    blockIds.add(metadata.id);

    const indent = analyzeIndent(indentText, lineNumber);
    const parsedMarker = parseMarker(
      trimmed,
      lineNumber,
      indentText.length,
      markerRules,
    );
    const isUnmarkedLine =
      parsedMarker.marker === null && parsedMarker.type === "concept";
    const isTopLevelConcept = indentText.length === 0 && isUnmarkedLine;
    const isUnknownIndentedSyntax = indentText.length > 0 && isUnmarkedLine;
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

    const node: CtnBlock = {
      children: [],
      diagnostics: nodeDiagnostics,
      endLineNumber:
        parsedMarker.role === "multiline"
          ? findClosingMultilineFenceLineNumber(
              lines,
              contentIndex + 1,
              parsedMarker.marker ?? "",
            )
          : lineNumber,
      id: metadata.id,
      indentText,
      inlineSpans:
        parsedMarker.role === "multiline" || isUnknownIndentedSyntax
          ? []
          : parseInlineSpans(
              parsedMarker.text,
              lineNumber,
              parsedMarker.textStartColumn,
              syntaxProfile.inlineRules,
            ),
      label: isUnknownIndentedSyntax
        ? "未知语法"
        : isTopLevelConcept
          ? syntaxProfile.conceptRule.label
          : parsedMarker.label,
      level: indent.level,
      lineNumber,
      marker: parsedMarker.marker,
      metadata: {
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
      },
      metadataLineNumber,
      rawText: line,
      role: parsedMarker.role,
      text: parsedMarker.text,
      textColor: isTopLevelConcept
        ? syntaxProfile.conceptRule.textColor
        : parsedMarker.textColor,
      tone: isTopLevelConcept
        ? syntaxProfile.conceptRule.tone
        : parsedMarker.tone,
      type: isUnknownIndentedSyntax
        ? "text"
        : isTopLevelConcept
          ? syntaxProfile.conceptRule.type
          : parsedMarker.type,
    };

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
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    blocks.push(node);
    diagnostics.push(...node.diagnostics);
    stack.push({ level: node.level, node });

    index = node.role === "multiline"
      ? node.endLineNumber
      : sourceBlock.nextIndex;
  }

  assignBlockEndLineNumbers(blocks, lines.length);

  return { roots, blocks, diagnostics };
}

export function parseCtnDocument(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
): CtnDocument {
  return parseDocument(source, syntaxProfile, "required");
}

export function parseLegacyCtnDocumentForMetadataInitialization(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
): CtnDocument {
  return parseDocument(source, syntaxProfile, "legacy-initialization");
}
