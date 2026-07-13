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
import type { CtnSyntaxProfile } from "../syntax/types";

function createTitleBlock({
  line,
  markerRules,
  syntaxProfile,
}: {
  line: string;
  markerRules: ReturnType<typeof sortMarkerRules>;
  syntaxProfile: CtnSyntaxProfile;
}): CtnBlock {
  const lineNumber = 1;
  const trimmed = line.trim();
  const indentText = line.match(/^\s*/)?.[0] ?? "";
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
    id: "block-1",
    lineNumber,
    endLineNumber: lineNumber,
    level: 0,
    indentText,
    marker: null,
    type: syntaxProfile.titleRule.type,
    role: "normal",
    textColor: syntaxProfile.titleRule.textColor,
    tone: syntaxProfile.titleRule.tone,
    label: syntaxProfile.titleRule.label,
    text: trimmed,
    rawText: line,
    inlineSpans: trimmed
      ? parseInlineSpans(
          trimmed,
          lineNumber,
          textStartColumn,
          syntaxProfile.inlineRules,
        )
      : [],
    diagnostics,
    children: [],
  };
}

export function parseCtnDocument(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
): CtnDocument {
  const lines = source.split("\n");
  const roots: CtnBlock[] = [];
  const blocks: CtnBlock[] = [];
  const diagnostics: CtnDiagnostic[] = [];
  const stack: Array<{ level: number; node: CtnBlock }> = [];
  const markerRules = sortMarkerRules(syntaxProfile.markerRules);
  const titleBlock = createTitleBlock({
    line: lines[0] ?? "",
    markerRules,
    syntaxProfile,
  });
  roots.push(titleBlock);
  blocks.push(titleBlock);
  diagnostics.push(...titleBlock.diagnostics);
  let index = 1;

  while (index < lines.length) {
    const line = lines[index];
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const indentText = line.match(/^\s*/)?.[0] ?? "";
    const indent = analyzeIndent(indentText, lineNumber);
    const parsedMarker = parseMarker(
      trimmed,
      lineNumber,
      indentText.length,
      markerRules,
    );
    const isUnmarkedLine =
      parsedMarker.marker === null && parsedMarker.type === "concept";
    const isTopLevelConcept =
      indentText.length === 0 && isUnmarkedLine;
    const isUnknownIndentedSyntax =
      indentText.length > 0 && isUnmarkedLine;
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
      id: `block-${lineNumber}`,
      lineNumber,
      endLineNumber:
        parsedMarker.role === "multiline"
          ? findClosingMultilineFenceLineNumber(
              lines,
              index + 1,
              parsedMarker.marker ?? "",
            )
          : lineNumber,
      level: indent.level,
      indentText,
      marker: parsedMarker.marker,
      type: isUnknownIndentedSyntax
        ? "text"
        : isTopLevelConcept
          ? syntaxProfile.conceptRule.type
          : parsedMarker.type,
      role: parsedMarker.role,
      textColor: isTopLevelConcept
        ? syntaxProfile.conceptRule.textColor
        : parsedMarker.textColor,
      tone: isTopLevelConcept
        ? syntaxProfile.conceptRule.tone
        : parsedMarker.tone,
      label: isUnknownIndentedSyntax
        ? "未知语法"
        : isTopLevelConcept
          ? syntaxProfile.conceptRule.label
          : parsedMarker.label,
      text: parsedMarker.text,
      rawText: line,
      inlineSpans:
        parsedMarker.role === "multiline" || isUnknownIndentedSyntax
          ? []
          : parseInlineSpans(
              parsedMarker.text,
              lineNumber,
              parsedMarker.textStartColumn,
              syntaxProfile.inlineRules,
            ),
      diagnostics: nodeDiagnostics,
      children: [],
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

    index = node.role === "multiline" ? node.endLineNumber : index + 1;
  }

  assignBlockEndLineNumbers(blocks, lines.length);

  return { roots, blocks, diagnostics };
}
