import type { WorkspaceBlockMigrationTargetPositionRequest } from "../../../workspace/commands/blockMigrationCommands";
import type { UiBlockNode } from "./viewBlocks";
import type {
  UiNoteId,
  UiNoteSummary,
  UiTreeNode,
} from "./viewTree";

export type UiMigrationView = {
  noteTree: UiTreeNode[];
  notes: UiNoteSummary[];
  sourceBlocks: UiBlockNode[];
  sourceNote: UiNoteSummary | null;
  sourceNoteId: UiNoteId;
  sourceRoots: UiBlockNode[];
  targetNote: UiNoteSummary | null;
  targetNoteId: UiNoteId;
  targetRoots: UiBlockNode[];
};

export function getUiTargetPositionLabel(value: string) {
  if (value === "end") {
    return "文末根块";
  }

  const [kind, lineNumberValue] = value.split(":");
  const lineNumber = Number(lineNumberValue);

  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    throw new Error(`Invalid block migration target position: ${value}`);
  }

  switch (kind) {
    case "sibling-above":
      return "上方并列";
    case "sibling-below":
      return "下方并列";
    case "inside":
      return "作为子结点";
    default:
      throw new Error(`Invalid block migration target position: ${value}`);
  }
}

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

export function createUiBlockMigrationTargetPositionValue(
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
