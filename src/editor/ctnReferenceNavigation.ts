import { EditorView } from "@codemirror/view";
import {
  ctnGlobalReferenceType,
  ctnLocalReferenceType,
} from "../../ctn/parser/inlineReferences";
import type { CtnEditableDocument } from "../../ctn/parser/types";
import type { CtnEditorParsePlugin } from "./ctnDecorations";

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
      (candidate.type === ctnGlobalReferenceType ||
        candidate.type === ctnLocalReferenceType) &&
      column >= candidate.startColumn &&
      column < candidate.endColumn,
  );

  return span
    ? {
        lineNumber: span.lineNumber,
        text: span.text,
        type: span.type,
      }
    : null;
}

export function createCtnReferenceNavigationExtension(
  parsePlugin: CtnEditorParsePlugin,
  onOpenReferenceRef: {
    current: ((target: CtnEditorReferenceTarget) => void) | undefined;
  },
) {
  return EditorView.domEventHandlers({
    click(event, view) {
      if (!(event.ctrlKey || event.metaKey)) {
        return false;
      }

      const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const parsed = view.plugin(parsePlugin);

      if (position === null || !parsed || !onOpenReferenceRef.current) {
        return false;
      }

      const line = view.state.doc.lineAt(position);
      const target = findCtnReferenceAtPosition(
        parsed.document,
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
