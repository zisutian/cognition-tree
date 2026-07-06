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
