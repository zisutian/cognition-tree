import type { CtnEditableDocument } from "../../core/ctn/parser/types";
import { parseCtnEditableBody } from "../../core/ctn/parser/parseCtnBody";
import { parseCtnEditableDocument } from "../../core/ctn/parser/parseCtnDocument";
import type { CtnSyntaxProfile } from "../../core/ctn/syntax/types";

export type CtnEditorContentMode =
  | { kind: "body"; title: string }
  | { kind: "document" }
  | { kind: "raw" };

export type CtnEditorParsedContentMode = Exclude<
  CtnEditorContentMode,
  { kind: "raw" }
>;

export function parseCtnEditorContent(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
  contentMode: CtnEditorParsedContentMode,
): CtnEditableDocument {
  return contentMode.kind === "body"
    ? parseCtnEditableBody(source, contentMode.title, syntaxProfile)
    : parseCtnEditableDocument(source, syntaxProfile);
}
