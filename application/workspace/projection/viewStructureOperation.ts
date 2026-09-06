import type { UiBlockNode } from "./viewBlocks.ts";
import type {
  UiNoteId,
  UiNoteSummary,
  UiTreeNode,
} from "./viewTree.ts";

export type UiStructureOperationView = {
  mode: "betweenNotes" | "withinNote";
  noteTree: UiTreeNode[];
  sourceBlocks: UiBlockNode[];
  sourceNote: UiNoteSummary | null;
  sourceNoteId: UiNoteId;
  sourceRoots: UiBlockNode[];
  structureBlocks: UiBlockNode[];
  structureNote: UiNoteSummary | null;
  structureNoteId: UiNoteId;
  structureRoots: UiBlockNode[];
  targetNote: UiNoteSummary | null;
  targetNoteId: UiNoteId;
  targetRoots: UiBlockNode[];
};
