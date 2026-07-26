import { EditorView } from "@codemirror/view";
import {
  ctnGlobalReferenceType,
  ctnLocalReferenceType,
} from "../../core/ctn/parser/inlineReferences";
import type { CtnEditableDocument } from "../../core/ctn/parser/types";
import type {
  CtnEditorAnalysisField,
} from "./ctnEditorAnalysis";

export type CtnEditorReferenceTarget = {
  lineNumber: number;
  text: string;
  type: string;
};

export function findCtnReferenceAtPosition(
  document: CtnEditableDocument,
  lineNumber: number,
  column: number,
): CtnEditorReferenceTarget | null {
  const block = document.blocks.find(
    (candidate) => candidate.lineNumber === lineNumber,
  );
  const span = block?.inlineSpans.find(
    (candidate) =>
      (candidate.rule.semanticId === ctnGlobalReferenceType ||
        candidate.rule.semanticId === ctnLocalReferenceType) &&
      column >= candidate.startColumn &&
      column < candidate.endColumn,
  );

  return span
    ? {
        lineNumber: span.lineNumber,
        text: span.text,
        type: span.rule.semanticId,
      }
    : null;
}

export function createCtnReferenceNavigationExtension(
  analysisField: CtnEditorAnalysisField,
  onOpenReferenceRef: {
    current: ((target: CtnEditorReferenceTarget) => void) | undefined;
  },
) {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) {
        return false;
      }

      const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const analysis = view.state.field(analysisField).analysis;

      if (position === null || !analysis || !onOpenReferenceRef.current) {
        return false;
      }

      const line = view.state.doc.lineAt(position);
      const target = findCtnReferenceAtPosition(
        analysis.document,
        line.number,
        position - line.from + 1,
      );

      if (!target) {
        return false;
      }

      event.preventDefault();
      onOpenReferenceRef.current(target);
      return true;
    },
  });
}
