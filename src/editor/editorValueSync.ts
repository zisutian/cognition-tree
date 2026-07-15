export type EditorValueSyncChange = {
  from: number;
  insert: string;
  to: number;
};

export function createEditorValueSyncChange(
  currentValue: string,
  nextValue: string,
): EditorValueSyncChange | null {
  if (currentValue === nextValue) {
    return null;
  }

  const sharedLength = Math.min(currentValue.length, nextValue.length);
  let from = 0;

  while (from < sharedLength && currentValue[from] === nextValue[from]) {
    from += 1;
  }

  let currentSuffixIndex = currentValue.length;
  let nextSuffixIndex = nextValue.length;

  while (
    currentSuffixIndex > from &&
    nextSuffixIndex > from &&
    currentValue[currentSuffixIndex - 1] === nextValue[nextSuffixIndex - 1]
  ) {
    currentSuffixIndex -= 1;
    nextSuffixIndex -= 1;
  }

  return {
    from,
    insert: nextValue.slice(from, nextSuffixIndex),
    to: currentSuffixIndex,
  };
}
