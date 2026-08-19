import type { CtnCanonicalDocument } from "../../../core/ctn/parser/types";
import type { CtnCompiledSyntax } from "../../../core/ctn/syntax/types";

export type UiEditorFocusTarget = {
  lineNumber: number;
  requestId: number;
};

type UiEditorViewBase = {
  documentText: string;
  focusTarget: UiEditorFocusTarget | null;
  stats: {
    lineCount: number;
    rootCount: number;
    totalBlocks: number;
  };
};

export type UiEditorView = UiEditorViewBase & (
  | { mode: "ctn"; syntax: CtnCompiledSyntax }
  | { mode: "raw"; syntax: null }
);

export function createUiEditorView({
  document,
  documentText,
  focusTarget,
  syntax,
}: {
  document: CtnCanonicalDocument | null;
  documentText: string;
  focusTarget: UiEditorFocusTarget | null;
  syntax: CtnCompiledSyntax | null;
}): UiEditorView {
  const view = {
    documentText,
    focusTarget,
    stats: {
      lineCount: documentText.split("\n").length,
      rootCount: document?.roots.length ?? 0,
      totalBlocks: document?.blocks.length ?? 0,
    },
  };

  if (document) {
    if (!syntax) {
      throw new Error("Parsed editor content requires prepared syntax.");
    }
    return { ...view, mode: "ctn", syntax };
  }
  return { ...view, mode: "raw", syntax: null };
}
