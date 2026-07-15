import type { CtnDocument } from "./types";

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
  document: CtnDocument,
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
