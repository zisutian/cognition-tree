export type CtnBlockType =
  | "concept"
  | "definition"
  | "component"
  | "personal-understanding"
  | "code"
  | "syntax-rule"
  | "text";

export type CtnInlineSpanType =
  | "inline-code"
  | "local-reference"
  | "global-reference"
  | "parallel-separator";

export type CtnInlineSpan = {
  id: string;
  type: CtnInlineSpanType;
  lineNumber: number;
  startColumn: number;
  endColumn: number;
  text: string;
};

export type CtnDiagnosticSeverity = "warning" | "error";

export type CtnDiagnosticCode =
  | "indent-level-jump"
  | "indent-not-multiple"
  | "mixed-indent"
  | "unknown-marker";

export type CtnDiagnostic = {
  id: string;
  code: CtnDiagnosticCode;
  severity: CtnDiagnosticSeverity;
  lineNumber: number;
  column: number;
  message: string;
};

export type CtnBlock = {
  id: string;
  lineNumber: number;
  endLineNumber: number;
  level: number;
  indentText: string;
  marker: string | null;
  type: CtnBlockType;
  label: string;
  text: string;
  rawText: string;
  inlineSpans: CtnInlineSpan[];
  diagnostics: CtnDiagnostic[];
  children: CtnBlock[];
};

export type CtnDocument = {
  roots: CtnBlock[];
  blocks: CtnBlock[];
  diagnostics: CtnDiagnostic[];
};

export type OutlineNode = CtnBlock;

export type CtnMarkerRule = {
  marker: string;
  type: CtnBlockType;
  label: string;
};

export type CtnSyntaxProfile = {
  id: string;
  name: string;
  version: number;
  spaceIndentUnit: number;
  markerRules: CtnMarkerRule[];
};

export type ParseCtnDocumentOptions = {
  syntaxProfile?: CtnSyntaxProfile;
};

export const defaultCtnSyntaxProfile = {
  id: "ctn-default",
  name: "默认 CTN 语法",
  version: 1,
  spaceIndentUnit: 4,
  markerRules: [
    { marker: "[语法]", type: "syntax-rule", label: "语法" },
    { marker: "```", type: "code", label: "代码块" },
    { marker: ":", type: "definition", label: "定义" },
    { marker: ">", type: "personal-understanding", label: "理解" },
    { marker: "-", type: "component", label: "组分" },
  ],
} satisfies CtnSyntaxProfile;

const invalidLineStartMarkers = ["#", "=", "?", "+"];

function sortMarkerRules(markerRules: CtnMarkerRule[]): CtnMarkerRule[] {
  return [...markerRules].sort(
    (left, right) => right.marker.length - left.marker.length,
  );
}

function createDiagnostic(
  code: CtnDiagnosticCode,
  severity: CtnDiagnosticSeverity,
  lineNumber: number,
  column: number,
  message: string,
): CtnDiagnostic {
  return {
    id: `${lineNumber}-${column}-${code}`,
    code,
    severity,
    lineNumber,
    column,
    message,
  };
}

function createInlineSpan(
  type: CtnInlineSpanType,
  lineNumber: number,
  textStartColumn: number,
  startOffset: number,
  endOffset: number,
  text: string,
): CtnInlineSpan {
  const startColumn = textStartColumn + startOffset;

  return {
    id: `${lineNumber}-${startColumn}-${type}`,
    type,
    lineNumber,
    startColumn,
    endColumn: textStartColumn + endOffset,
    text,
  };
}

function parseInlineSpans(
  text: string,
  lineNumber: number,
  textStartColumn: number,
): CtnInlineSpan[] {
  const spans: CtnInlineSpan[] = [];
  let index = 0;

  while (index < text.length) {
    if (text[index] === "`") {
      const closeIndex = text.indexOf("`", index + 1);

      if (closeIndex >= 0) {
        spans.push(
          createInlineSpan(
            "inline-code",
            lineNumber,
            textStartColumn,
            index,
            closeIndex + 1,
            text.slice(index + 1, closeIndex),
          ),
        );
        index = closeIndex + 1;
        continue;
      }
    }

    if (text.startsWith("[[", index)) {
      const closeIndex = text.indexOf("]]", index + 2);

      if (closeIndex >= 0) {
        spans.push(
          createInlineSpan(
            "global-reference",
            lineNumber,
            textStartColumn,
            index,
            closeIndex + 2,
            text.slice(index + 2, closeIndex),
          ),
        );
        index = closeIndex + 2;
        continue;
      }
    }

    if (text[index] === "<") {
      const closeIndex = text.indexOf(">", index + 1);

      if (closeIndex >= 0) {
        spans.push(
          createInlineSpan(
            "local-reference",
            lineNumber,
            textStartColumn,
            index,
            closeIndex + 1,
            text.slice(index + 1, closeIndex),
          ),
        );
        index = closeIndex + 1;
        continue;
      }
    }

    if (text[index] === "\\") {
      spans.push(
        createInlineSpan(
          "parallel-separator",
          lineNumber,
          textStartColumn,
          index,
          index + 1,
          "\\",
        ),
      );
      index += 1;
      continue;
    }

    index += 1;
  }

  return spans;
}

function analyzeIndent(
  indentText: string,
  lineNumber: number,
  spaceIndentUnit: number,
) {
  const diagnostics: CtnDiagnostic[] = [];
  const tabCount = [...indentText].filter((char) => char === "\t").length;
  const spaceCount = [...indentText].filter((char) => char === " ").length;

  if (tabCount > 0 && spaceCount > 0) {
    diagnostics.push(
      createDiagnostic(
        "mixed-indent",
        "warning",
        lineNumber,
        1,
        "缩进同时包含 Tab 和空格。",
      ),
    );
  }

  if (spaceCount % spaceIndentUnit !== 0) {
    diagnostics.push(
      createDiagnostic(
        "indent-not-multiple",
        "warning",
        lineNumber,
        1,
        `空格缩进不是 ${spaceIndentUnit} 的倍数。`,
      ),
    );
  }

  return {
    diagnostics,
    level: tabCount + Math.floor(spaceCount / spaceIndentUnit),
  };
}

function parseMarker(
  trimmed: string,
  lineNumber: number,
  indentWidth: number,
  markerRules: CtnMarkerRule[],
) {
  const matchedRule = markerRules.find((rule) => trimmed.startsWith(rule.marker));

  if (matchedRule) {
    const textAfterMarker = trimmed.slice(matchedRule.marker.length);
    const textLeadingWhitespace = textAfterMarker.match(/^\s*/)?.[0].length ?? 0;

    return {
      diagnostics: [] as CtnDiagnostic[],
      label: matchedRule.label,
      marker: matchedRule.marker,
      text: textAfterMarker.trim(),
      textStartColumn:
        indentWidth + matchedRule.marker.length + textLeadingWhitespace + 1,
      type: matchedRule.type,
    };
  }

  if (trimmed.startsWith("[")) {
    const markerEnd = trimmed.indexOf("]");

    if (markerEnd > 0) {
      const marker = trimmed.slice(0, markerEnd + 1);
      const textAfterMarker = trimmed.slice(marker.length);
      const textLeadingWhitespace = textAfterMarker.match(/^\s*/)?.[0].length ?? 0;

      return {
        diagnostics: [
          createDiagnostic(
            "unknown-marker",
            "warning",
            lineNumber,
            indentWidth + 1,
            `未知行首符号 ${marker}。`,
          ),
        ],
        label: "未知符号",
        marker,
        text: textAfterMarker.trim(),
        textStartColumn: indentWidth + marker.length + textLeadingWhitespace + 1,
        type: "text" as CtnBlockType,
      };
    }
  }

  const invalidLineStartMarker = invalidLineStartMarkers.find((marker) =>
    trimmed.startsWith(marker),
  );

  if (invalidLineStartMarker) {
    const textAfterMarker = trimmed.slice(invalidLineStartMarker.length);
    const textLeadingWhitespace = textAfterMarker.match(/^\s*/)?.[0].length ?? 0;

    return {
      diagnostics: [
        createDiagnostic(
          "unknown-marker",
          "warning",
          lineNumber,
          indentWidth + 1,
          `未知行首符号 ${invalidLineStartMarker}。`,
        ),
      ],
      label: "未知符号",
      marker: invalidLineStartMarker,
      text: textAfterMarker.trim(),
      textStartColumn:
        indentWidth + invalidLineStartMarker.length + textLeadingWhitespace + 1,
      type: "text" as CtnBlockType,
    };
  }

  return {
    diagnostics: [] as CtnDiagnostic[],
    label: "概念",
    marker: null,
    text: trimmed,
    textStartColumn: indentWidth + 1,
    type: "concept" as CtnBlockType,
  };
}

function findClosingCodeFenceLineNumber(
  lines: string[],
  startIndex: number,
): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith("```")) {
      return index + 1;
    }
  }

  return lines.length;
}

function assignBlockEndLineNumbers(
  blocks: CtnBlock[],
  totalLineCount: number,
) {
  blocks.forEach((block, blockIndex) => {
    let subtreeEndLineNumber = totalLineCount;

    for (
      let nextBlockIndex = blockIndex + 1;
      nextBlockIndex < blocks.length;
      nextBlockIndex += 1
    ) {
      const nextBlock = blocks[nextBlockIndex];

      if (nextBlock.level <= block.level) {
        subtreeEndLineNumber = nextBlock.lineNumber - 1;
        break;
      }
    }

    block.endLineNumber = Math.max(block.endLineNumber, subtreeEndLineNumber);
  });
}

export function parseCtnDocument(
  source: string,
  options: ParseCtnDocumentOptions = {},
): CtnDocument {
  const lines = source.split("\n");
  const roots: CtnBlock[] = [];
  const blocks: CtnBlock[] = [];
  const diagnostics: CtnDiagnostic[] = [];
  const stack: Array<{ level: number; node: CtnBlock }> = [];
  const syntaxProfile = options.syntaxProfile ?? defaultCtnSyntaxProfile;
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
        parsedMarker.type === "code"
          ? findClosingCodeFenceLineNumber(lines, index + 1)
          : lineNumber,
      level: indent.level,
      indentText,
      marker: parsedMarker.marker,
      type: parsedMarker.type,
      label: parsedMarker.label,
      text: parsedMarker.text,
      rawText: line,
      inlineSpans:
        parsedMarker.type === "code"
          ? []
          : parseInlineSpans(
              parsedMarker.text,
              lineNumber,
              parsedMarker.textStartColumn,
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

    index = node.type === "code" ? node.endLineNumber : index + 1;
  }

  assignBlockEndLineNumbers(blocks, lines.length);

  return { roots, blocks, diagnostics };
}

export function parseOutline(
  source: string,
  options: ParseCtnDocumentOptions = {},
): OutlineNode[] {
  return parseCtnDocument(source, options).roots;
}
