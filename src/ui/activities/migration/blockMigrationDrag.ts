export const blockDragDataType = "application/x-cognition-tree-block-line";

export function createBlockDragLineNumberPayload(lineNumber: number) {
  return String(lineNumber);
}

export function readBlockDragLineNumberPayload({
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
