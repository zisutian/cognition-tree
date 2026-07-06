import type { WorkspaceBlockMigrationTargetPositionRequest } from "../../../workspace/commands/blockMigrationCommands";

export function parseUiBlockMigrationTargetPosition(
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

  if (kind === "sibling-above" || kind === "sibling-below") {
    return {
      kind,
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
