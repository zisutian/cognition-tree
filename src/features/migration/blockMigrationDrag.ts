import type { WorkspaceBlockMigrationTargetPositionRequest } from "../../workspace/actions/blockMigrationActions";

export const blockDragDataType = "application/x-cognition-tree-block-line";

export function parseBlockMigrationTargetPosition(
  value: string,
): WorkspaceBlockMigrationTargetPositionRequest {
  if (value === "end") {
    return { kind: "end" };
  }

  const [kind, lineNumberValue] = value.split(":");
  const lineNumber = Number(lineNumberValue);

  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    throw new Error(`Invalid block migration target position: ${value}`);
  }

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

  if (kind !== "inside") {
    throw new Error(`Invalid block migration target position: ${value}`);
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
