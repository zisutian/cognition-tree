// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createPortableNameKey,
  getPortableNameIssue,
} from "../../core/naming/index.ts";
import type { TodoParseIndex } from "../../core/todo/index.ts";
import {
  todoItemSemanticType,
  type TodoCollectionId,
  createTodoCollectionBodyProjection,
} from "../../core/todo/index.ts";


export type TodoDiagnostic = {
  code: string;
  id: string;
  locationLabel: string;
  message: string;
  severity: "error" | "warning";
  source: "document" | "name" | "syntax";
  target:
    | {
        collectionId: TodoCollectionId;
        kind: "todo-collection-line";
        lineNumber: number;
      }
    | {
        collectionId: TodoCollectionId;
        entity: "collection";
        kind: "portable-name";
        owner: "todo";
      };
};

export type TodoDiagnostics = {
  diagnostics: TodoDiagnostic[];
  errorCount: number;
  status: "ready";
  warningCount: number;
};

function compare(left: TodoDiagnostic, right: TodoDiagnostic) {
  if (left.severity !== right.severity) {
    return left.severity === "error" ? -1 : 1;
  }
  return left.locationLabel.localeCompare(right.locationLabel, "zh-CN", {
    numeric: true,
  }) || left.id.localeCompare(right.id);
}

export function createTodoDiagnostics(index: TodoParseIndex): TodoDiagnostics {
  const nameCounts = new Map<string, number>();

  for (const parsed of index.collections) {
    const key = createPortableNameKey(parsed.name);

    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const diagnostics = index.collections.flatMap((parsed) => {
    const projection = createTodoCollectionBodyProjection(parsed);
    const projected = parsed.analysis.document.diagnostics
      .filter(({ lineNumber }) => lineNumber > 1)
      .map((diagnostic): TodoDiagnostic => {
        const lineNumber = projection.projectCanonicalLineNumber(
          diagnostic.lineNumber,
        );
        const block = parsed.analysis.document.blocks.find(({ diagnostics }) =>
          diagnostics.some(({ id }) => id === diagnostic.id)
        );
        const isMissingMarker = diagnostic.code === "unknown-syntax" &&
          block?.rule.semanticId !== todoItemSemanticType;

        return {
          code: isMissingMarker ? "missing-todo-marker" : diagnostic.code,
          id: `todo:document:${parsed.collection.id}:${diagnostic.id}`,
          locationLabel: `${parsed.name} · L${lineNumber}:C${diagnostic.column}`,
          message: isMissingMarker
            ? "代办正文必须使用已配置的代办行首符号。"
            : diagnostic.message,
          severity: diagnostic.severity,
          source: "document",
          target: {
            collectionId: parsed.collection.id,
            kind: "todo-collection-line",
            lineNumber,
          },
        };
      });
    const nameIssue = getPortableNameIssue(parsed.name);

    if (nameIssue !== null) {
      projected.push({
        code: "nonportable-todo-collection-name",
        id: `todo:name:${parsed.collection.id}`,
        locationLabel: parsed.name,
        message: nameIssue === "noncanonical"
          ? "事项集合名称需要规范化，请手工重命名。"
          : "事项集合名称包含不可移植字符，请手工重命名。",
        severity: "error",
        source: "name",
        target: {
          collectionId: parsed.collection.id,
          entity: "collection",
          kind: "portable-name",
          owner: "todo",
        },
      });
    }
    if ((nameCounts.get(createPortableNameKey(parsed.name)) ?? 0) > 1) {
      projected.push({
        code: "todo-collection-name-conflict",
        id: `todo:name-conflict:${parsed.collection.id}`,
        locationLabel: parsed.name,
        message: "事项集合名称与另一集合冲突，请手工重命名。",
        severity: "error",
        source: "name",
        target: {
          collectionId: parsed.collection.id,
          entity: "collection",
          kind: "portable-name",
          owner: "todo",
        },
      });
    }
    return projected;
  }).sort(compare);

  return {
    diagnostics,
    errorCount: diagnostics.filter(({ severity }) => severity === "error")
      .length,
    status: "ready",
    warningCount: diagnostics.filter(({ severity }) => severity === "warning")
      .length,
  };
}
