// SPDX-License-Identifier: GPL-3.0-or-later

import type { CtnEditableDocument } from "./types.ts";

export const ctnGlobalReferenceType = "global-reference";
export const ctnLocalReferenceType = "local-reference";

export type CtnInlineReference = {
  lineNumber: number;
  text: string;
  type: string;
};

export function normalizeCtnReferenceText(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

export function collectCtnInlineReferences(
  document: Pick<CtnEditableDocument, "blocks">,
  type: string,
): CtnInlineReference[] {
  return document.blocks.flatMap((block) =>
    block.inlineSpans
      .filter((span) => span.type === type)
      .map((span) => ({
        lineNumber: span.lineNumber,
        text: span.text,
        type: span.type,
      })),
  );
}
