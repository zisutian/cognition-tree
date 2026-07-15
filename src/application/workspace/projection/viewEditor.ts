import type { CtnDocument } from "../../../ctn/parser/types";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";

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
  errorMessage: string;
};

export function createUiEditorView({
  document,
  documentText,
  focusTarget,
  syntaxProfile,
  errorMessage,
}: {
  document: CtnDocument | null;
  documentText: string;
  focusTarget: UiEditorFocusTarget | null;
  syntaxProfile: CtnSyntaxProfile;
  errorMessage: string;
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
    errorMessage,
  };
}
