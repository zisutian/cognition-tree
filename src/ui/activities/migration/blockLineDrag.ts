export const blockLineDragDataType = "application/x-cognition-tree-block-line";

export function createBlockLineDragPayload(lineNumber: number) {
  return String(lineNumber);
}

export function readBlockLineDragPayload({
  plainText,
  typedPayload,
}: {
  plainText: string;
  typedPayload: string;
}) {
  const lineNumberValue = typedPayload || plainText;

  if (!lineNumberValue) {
    return null;
  }

  const lineNumber = Number(lineNumberValue);

  return Number.isInteger(lineNumber) && lineNumber > 0
    ? String(lineNumber)
    : null;
}
