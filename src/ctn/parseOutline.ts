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
  OutlineNode,
  ParseCtnDocumentOptions,
} from "./types";

export type {
  CtnBlock,
  CtnDiagnostic,
  CtnDiagnosticCode,
  CtnDiagnosticSeverity,
  CtnDocument,
  CtnInlineSpan,
  OutlineNode,
  ParseCtnDocumentOptions,
} from "./types";

export function parseCtnDocument(
  source: string,
  options: ParseCtnDocumentOptions,
): CtnDocument {
  const lines = source.split("\n");
  const roots: CtnBlock[] = [];
  const blocks: CtnBlock[] = [];
  const diagnostics: CtnDiagnostic[] = [];
  const stack: Array<{ level: number; node: CtnBlock }> = [];
  const syntaxProfile = options.syntaxProfile;
  const markerRules = sortMarkerRules(syntaxProfile.markerRules);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const indentText = line.match(/^\s*/)?.[0] ?? "";
    const indent = analyzeIndent(
      indentText,
      lineNumber,
      syntaxProfile.spaceIndentUnit,
    );
    const parsedMarker = parseMarker(
      trimmed,
      lineNumber,
      indentText.length,
      markerRules,
    );
    const nodeDiagnostics = [...indent.diagnostics, ...parsedMarker.diagnostics];
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
      type: parsedMarker.type,
      role: parsedMarker.role,
      tone: parsedMarker.tone,
      label: parsedMarker.label,
      text: parsedMarker.text,
      rawText: line,
      inlineSpans:
        parsedMarker.role === "multiline"
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

export function parseOutline(
  source: string,
  options: ParseCtnDocumentOptions,
): OutlineNode[] {
  return parseCtnDocument(source, options).roots;
}
