export type CtnBlockType =
  | "concept"
  | "definition"
  | "component"
  | "personal-understanding"
  | "code"
  | "syntax-rule"
  | "text";

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
  level: number;
  indentText: string;
  marker: string | null;
  type: CtnBlockType;
  label: string;
  text: string;
  rawText: string;
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
    return {
      diagnostics: [] as CtnDiagnostic[],
      label: matchedRule.label,
      marker: matchedRule.marker,
      text: trimmed.slice(matchedRule.marker.length).trim(),
      type: matchedRule.type,
    };
  }

  if (trimmed.startsWith("[")) {
    const markerEnd = trimmed.indexOf("]");

    if (markerEnd > 0) {
      const marker = trimmed.slice(0, markerEnd + 1);
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
        text: trimmed.slice(marker.length).trim(),
        type: "text" as CtnBlockType,
      };
    }
  }

  const invalidLineStartMarker = invalidLineStartMarkers.find((marker) =>
    trimmed.startsWith(marker),
  );

  if (invalidLineStartMarker) {
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
      text: trimmed.slice(invalidLineStartMarker.length).trim(),
      type: "text" as CtnBlockType,
    };
  }

  return {
    diagnostics: [] as CtnDiagnostic[],
    label: "概念",
    marker: null,
    text: trimmed,
    type: "concept" as CtnBlockType,
  };
}

export function parseCtnDocument(
  source: string,
  options: ParseCtnDocumentOptions = {},
): CtnDocument {
  const roots: CtnBlock[] = [];
  const blocks: CtnBlock[] = [];
  const diagnostics: CtnDiagnostic[] = [];
  const stack: Array<{ level: number; node: CtnBlock }> = [];
  const syntaxProfile = options.syntaxProfile ?? defaultCtnSyntaxProfile;
  const markerRules = sortMarkerRules(syntaxProfile.markerRules);

  source.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      return;
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
      level: indent.level,
      indentText,
      marker: parsedMarker.marker,
      type: parsedMarker.type,
      label: parsedMarker.label,
      text: parsedMarker.text,
      rawText: line,
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
  });

  return { roots, blocks, diagnostics };
}

export function parseOutline(
  source: string,
  options: ParseCtnDocumentOptions = {},
): OutlineNode[] {
  return parseCtnDocument(source, options).roots;
}
