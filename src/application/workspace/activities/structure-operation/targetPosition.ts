import type { WorkspaceStructureBlockTargetPositionRequest } from "../../../../../core/workspace/commands/structureBlockCommands";

export function parseUiStructureOperationTargetPosition(
  value: string,
): WorkspaceStructureBlockTargetPositionRequest {
  if (value === "end") {
    return { kind: "end" };
  }

  const [kind, lineNumberValue] = value.split(":");
  const lineNumber = Number(lineNumberValue);

  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    throw new Error(`Invalid structure operation target position: ${value}`);
  }

  if (kind === "sibling-above" || kind === "sibling-below") {
    return {
      kind,
      lineNumber,
    };
  }

  if (kind !== "inside") {
    throw new Error(`Invalid structure operation target position: ${value}`);
  }

  return {
    kind: "inside-block",
    lineNumber,
  };
}
