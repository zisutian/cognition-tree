import type { WorkspaceBlockMigrationTargetPositionRequest } from "../../workspace/workspaceBlockMigration";

export const blockDragDataType = "application/x-cognition-tree-block-line";

export function parseBlockMigrationTargetPosition(
  value: string,
): WorkspaceBlockMigrationTargetPositionRequest {
  if (value === "end") {
    return { kind: "end" };
  }

  const [kind, lineNumberValue] = value.split(":");
  const lineNumber = Number(lineNumberValue);

  if (kind === "sibling-above") {
    return {
      kind: "sibling-above",
      lineNumber,
    };
  }

  if (kind === "sibling-below") {
    return {
      kind: "sibling-below",
      lineNumber,
    };
  }

  return {
    kind: "inside-block",
    lineNumber,
  };
}

export function createBlockMigrationTargetPositionValue(
  targetPosition: WorkspaceBlockMigrationTargetPositionRequest,
) {
  switch (targetPosition.kind) {
    case "end":
      return "end";
    case "inside-block":
      return `inside:${targetPosition.lineNumber}`;
    case "sibling-above":
      return `sibling-above:${targetPosition.lineNumber}`;
    case "sibling-below":
      return `sibling-below:${targetPosition.lineNumber}`;
  }
}

export function createBlockDragLineNumberPayload(lineNumber: number) {
  return String(lineNumber);
}

export function readBlockDragLineNumberPayload({
  fallback,
  plainText,
  typedPayload,
}: {
  fallback: string | null;
  plainText: string;
  typedPayload: string;
}) {
  const lineNumberValue = typedPayload || plainText || fallback;

  if (!lineNumberValue) {
    return null;
  }

  const lineNumber = Number(lineNumberValue);

  return Number.isInteger(lineNumber) && lineNumber > 0
    ? String(lineNumber)
    : null;
}
