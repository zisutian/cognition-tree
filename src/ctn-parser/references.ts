import type { CtnSyntaxProfile } from "../ctn-syntax/types";
import { parseCtnDocument, type CtnDocument } from "./parseOutline";

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

export function extractCtnInlineReferences(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
  type: string,
) {
  return collectCtnInlineReferences(
    parseCtnDocument(source, { syntaxProfile }),
    type,
  );
}
