import type { CtnDocument } from "./types";

export type CtnInlineReference = {
  lineNumber: number;
  text: string;
  type: string;
};

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
