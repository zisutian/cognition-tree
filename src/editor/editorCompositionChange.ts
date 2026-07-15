type EditorCompositionChangeOptions = {
  onChange: (value: string) => void;
  schedule?: (callback: () => void) => void;
};

export type EditorDocumentChange = {
  isComposing: boolean;
  isExternal: boolean;
  value: string;
};

export function createEditorCompositionChange({
  onChange,
  schedule = queueMicrotask,
}: EditorCompositionChangeOptions) {
  let hasPendingCompositionChange = false;
  let lastEmittedValue: string | null = null;

  const emit = (value: string) => {
    if (value === lastEmittedValue) {
      return;
    }

    lastEmittedValue = value;
    onChange(value);
  };

  return {
    handleCompositionEnd(readValue: () => string) {
      if (!hasPendingCompositionChange) {
        return;
      }

      hasPendingCompositionChange = false;
      schedule(() => emit(readValue()));
    },
    handleDocumentChange({
      isComposing,
      isExternal,
      value,
    }: EditorDocumentChange) {
      if (isExternal) {
        return;
      }

      if (isComposing) {
        hasPendingCompositionChange = true;
        return;
      }

      hasPendingCompositionChange = false;
      emit(value);
    },
  };
}
