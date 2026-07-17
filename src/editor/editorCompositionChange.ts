import { type ChangeSet } from "@codemirror/state";
import type {
  CtnEditableSourceChange,
  CtnTextEdit,
} from "../../ctn/metadata/textEdits";

type EditorCompositionChangeOptions = {
  onChange: (change: CtnEditableSourceChange) => void;
  schedule?: (callback: () => void) => void;
};

export type EditorDocumentChange = {
  changes: ChangeSet;
  isComposing: boolean;
  isExternal: boolean;
  source: string;
};

export function createCtnTextEdits(changes: ChangeSet): CtnTextEdit[] {
  const edits: CtnTextEdit[] = [];

  changes.iterChanges((from, to, _fromAfter, _toAfter, inserted) => {
    edits.push({
      from,
      insertedText: inserted.toString(),
      to,
    });
  });

  return edits;
}

export function createEditorCompositionChange({
  onChange,
  schedule = queueMicrotask,
}: EditorCompositionChangeOptions) {
  let pendingCompositionChanges: ChangeSet | null = null;
  let lastEmittedSource: string | null = null;
  let compositionGeneration = 0;

  const emit = (source: string, changes: ChangeSet) => {
    if (source === lastEmittedSource) {
      return;
    }

    lastEmittedSource = source;
    onChange({ edits: createCtnTextEdits(changes), source });
  };

  return {
    handleCompositionEnd(readSource: () => string) {
      if (!pendingCompositionChanges) {
        return;
      }

      const scheduledGeneration = compositionGeneration;
      schedule(() => {
        if (
          scheduledGeneration === compositionGeneration &&
          pendingCompositionChanges
        ) {
          const changes = pendingCompositionChanges;

          pendingCompositionChanges = null;
          emit(readSource(), changes);
        }
      });
    },
    handleDocumentChange({
      changes,
      isComposing,
      isExternal,
      source,
    }: EditorDocumentChange) {
      if (isExternal) {
        pendingCompositionChanges = null;
        compositionGeneration += 1;
        lastEmittedSource = source;
        return;
      }

      if (isComposing) {
        pendingCompositionChanges = pendingCompositionChanges
          ? pendingCompositionChanges.compose(changes)
          : changes;
        return;
      }

      if (pendingCompositionChanges) {
        const composedChanges = pendingCompositionChanges.compose(changes);

        pendingCompositionChanges = null;
        compositionGeneration += 1;
        emit(source, composedChanges);
        return;
      }

      emit(source, changes);
    },
  };
}
