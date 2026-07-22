import type { CtnCanonicalDocument } from "../../../core/ctn/parser/types";
import type { CtnSyntaxProfile } from "../../../core/ctn/syntax/types";

export type UiEditorFocusTarget = {
  lineNumber: number;
  requestId: number;
};

export type UiEditorView = {
  documentText: string;
  focusTarget: UiEditorFocusTarget | null;
  mode: "ctn" | "raw";
  stats: {
    lineCount: number;
    rootCount: number;
    totalBlocks: number;
  };
  syntaxProfile: CtnSyntaxProfile;
};

export function createUiEditorView({
  document,
  documentText,
  focusTarget,
  syntaxProfile,
}: {
  document: CtnCanonicalDocument | null;
  documentText: string;
  focusTarget: UiEditorFocusTarget | null;
  syntaxProfile: CtnSyntaxProfile;
}): UiEditorView {
  return {
    documentText,
    focusTarget,
    mode: document ? "ctn" : "raw",
    stats: {
      lineCount: documentText.split("\n").length,
      rootCount: document?.roots.length ?? 0,
      totalBlocks: document?.blocks.length ?? 0,
    },
    syntaxProfile,
  };
}
