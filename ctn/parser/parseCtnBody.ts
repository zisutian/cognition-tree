// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnSyntaxProfile } from "../syntax/types.ts";
import { parseCtnEditableDocument } from "./parseCtnDocument.ts";
import type {
  CtnDiagnostic,
  CtnEditableBlock,
  CtnEditableDocument,
  CtnInlineSpan,
  CtnMultilineRange,
} from "./types.ts";

function assertValidHiddenTitle(title: string) {
  if (!title.trim() || title.includes("\n") || title.includes("\r")) {
    throw new Error("CTN body title must be one non-empty line");
  }
}

function projectDiagnostic(diagnostic: CtnDiagnostic): CtnDiagnostic {
  const lineNumber = diagnostic.lineNumber - 1;

  return {
    ...diagnostic,
    id: `${lineNumber}-${diagnostic.column}-${diagnostic.code}`,
    lineNumber,
  };
}

function projectInlineSpan(span: CtnInlineSpan): CtnInlineSpan {
  const lineNumber = span.lineNumber - 1;

  return {
    ...span,
    id: `${lineNumber}-${span.startColumn}-${span.type}`,
    lineNumber,
  };
}

function projectMultilineRange(
  range: CtnMultilineRange | null,
): CtnMultilineRange | null {
  if (!range) {
    return null;
  }

  return range.status === "closed"
    ? {
        ...range,
        closingFenceLineNumber: range.closingFenceLineNumber - 1,
        contentEndLineNumber: range.contentEndLineNumber - 1,
        contentStartLineNumber: range.contentStartLineNumber - 1,
      }
    : {
        ...range,
        contentEndLineNumber: range.contentEndLineNumber - 1,
        contentStartLineNumber: range.contentStartLineNumber - 1,
      };
}

/**
 * Removes a synthetic title from an editable CTN parse result and projects all
 * remaining source coordinates back onto the body-only editor document.
 */
export function projectCtnEditableBodyDocument(
  document: CtnEditableDocument,
): CtnEditableDocument {
  const bodyBlocks = document.blocks.filter((block) => block.lineNumber > 1);
  const projectedByBlock = new Map<CtnEditableBlock, CtnEditableBlock>();

  for (const block of bodyBlocks) {
    projectedByBlock.set(block, {
      ...block,
      children: [],
      diagnostics: block.diagnostics.map(projectDiagnostic),
      inlineSpans: block.inlineSpans.map(projectInlineSpan),
      lexicalEndLineNumber: block.lexicalEndLineNumber - 1,
      lineNumber: block.lineNumber - 1,
      multilineRange: projectMultilineRange(block.multilineRange),
      subtreeEndLineNumber: block.subtreeEndLineNumber - 1,
    });
  }

  for (const block of bodyBlocks) {
    const projected = projectedByBlock.get(block);

    if (projected) {
      projected.children = block.children.flatMap((child) => {
        const projectedChild = projectedByBlock.get(child);
        return projectedChild ? [projectedChild] : [];
      });
    }
  }

  return {
    blocks: bodyBlocks.flatMap((block) => {
      const projected = projectedByBlock.get(block);
      return projected ? [projected] : [];
    }),
    diagnostics: document.diagnostics
      .filter((diagnostic) => diagnostic.lineNumber > 1)
      .map(projectDiagnostic),
    roots: document.roots.flatMap((root) => {
      const projected = projectedByBlock.get(root);
      return projected ? [projected] : [];
    }),
  };
}

/** Parses body-only source without ever placing its fixed title in the editor. */
export function parseCtnEditableBody(
  bodySource: string,
  title: string,
  syntaxProfile: CtnSyntaxProfile,
): CtnEditableDocument {
  assertValidHiddenTitle(title);
  const document = parseCtnEditableDocument(
    `${title}\n${bodySource}`,
    syntaxProfile,
  );

  if (document.blocks[0]?.diagnostics.length) {
    throw new Error("CTN body title must be a valid CTN title line");
  }

  return projectCtnEditableBodyDocument(document);
}
