import type {
  StructureOperationActivityViewModel,
} from "../../../application/workspace/notes/structure/structureOperationViewModel";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";

export function createStructureOperationView(
  overrides: Partial<StructureOperationActivityViewModel> = {},
): StructureOperationActivityViewModel {
  return {
    deleteFolder: () => undefined,
    deleteNote: () => undefined,
    indentUnitCount: defaultCtnSyntax.tabDisplayWidth,
    mode: "betweenNotes",
    moveTreeNode: () => undefined,
    noteTree: [
      {
        canDrag: true,
        folderId: null,
        id: "source-node",
        kind: "note",
        noteId: "note-source",
        parentFolderId: null,
        title: "Source note",
      },
      {
        canDrag: true,
        folderId: null,
        id: "target-node",
        kind: "note",
        noteId: "note-target",
        parentFolderId: null,
        title: "Target note",
      },
    ],
    onMoveStructureBlockBetweenNotes: () => undefined,
    onMoveStructureBlockWithinNote: () => undefined,
    onSelectDirectoryNote: () => undefined,
    onSetMode: () => undefined,
    onSwapSourceAndTargetNotes: () => undefined,
    pairSelectionPhase: "selectSource",
    renameFolder: () => undefined,
    renameNote: () => undefined,
    sourceBlocks: [],
    sourceNote: { id: "note-source", title: "Source note" },
    sourceNoteId: "note-source",
    sourceRoots: [],
    structureBlocks: [],
    structureNote: { id: "note-source", title: "Source note" },
    structureNoteId: "note-source",
    structureRoots: [],
    targetNote: { id: "note-target", title: "Target note" },
    targetNoteId: "note-target",
    targetRoots: [],
    ...overrides,
  };
}
