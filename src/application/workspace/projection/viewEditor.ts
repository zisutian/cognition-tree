import type { CtnDocument } from "../../../ctn/parser/types";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";

export type UiEditorFocusTarget = {
  lineNumber: number;
  requestId: number;
};

export type UiEditorDiagnostic = {
  id: string;
  lineNumber: number;
  message: string;
};

export type UiEditorView = {
  currentNoteTitle: string | null;
  diagnostics: UiEditorDiagnostic[];
  documentText: string;
  focusTarget: UiEditorFocusTarget | null;
  hasActiveNote: boolean;
  hasParsedDocument: boolean;
  mode: "ctn" | "raw";
  stats: {
    diagnosticCount: number;
    lineCount: number;
    rootCount: number;
    totalBlocks: number;
  };
  syntaxProfile: CtnSyntaxProfile;
  errorMessage: string;
};

export function createUiEditorView({
  activeNoteTitle,
  document,
  documentText,
  focusTarget,
  hasActiveNote,
  syntaxProfile,
  errorMessage,
}: {
  activeNoteTitle: string | null;
  document: CtnDocument | null;
  documentText: string;
  focusTarget: UiEditorFocusTarget | null;
  hasActiveNote: boolean;
  syntaxProfile: CtnSyntaxProfile;
  errorMessage: string;
}): UiEditorView {
  return {
    currentNoteTitle: activeNoteTitle,
    diagnostics:
      document?.diagnostics.map((diagnostic) => ({
        id: diagnostic.id,
        lineNumber: diagnostic.lineNumber,
        message: diagnostic.message,
      })) ?? [],
    documentText,
    focusTarget,
    hasActiveNote,
    hasParsedDocument: document !== null,
    mode: document ? "ctn" : "raw",
    stats: {
      diagnosticCount: document?.diagnostics.length ?? 0,
      lineCount: documentText.split("\n").length,
      rootCount: document?.roots.length ?? 0,
      totalBlocks: document?.blocks.length ?? 0,
    },
    syntaxProfile,
    errorMessage,
  };
}
