import type {
  NotesViewModel,
} from "../../../application/workspace/notes/edit/notesViewModel";
import { defaultCtnSyntax } from "../../../core/ctn/syntax/defaultSyntax";

export function createNotesView(
  overrides: Partial<NotesViewModel> = {},
): NotesViewModel {
  return {
    activeNote: {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "note-source",
      title: "当前笔记",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    directory: {
      activeFolderId: null,
      activeNode: { kind: "note", noteId: "note-source" },
      clearFolderSelection: () => undefined,
      createFolder: () => undefined,
      createNote: () => undefined,
      deleteFolder: () => undefined,
      deleteNote: () => undefined,
      moveTreeNode: () => undefined,
      noteTree: [],
      renameFolder: () => undefined,
      renameNote: () => undefined,
      selectFolder: () => undefined,
      selectNote: () => undefined,
    },
    editor: {
      documentText: "当前笔记",
      focusTarget: null,
      mode: "ctn",
      stats: {
        lineCount: 1,
        rootCount: 1,
        totalBlocks: 1,
      },
      syntax: defaultCtnSyntax,
      onActiveLineChange: () => undefined,
      onConsumeFocusTarget: () => undefined,
      readOnly: false,
    },
    outline: {
      activeBlock: null,
      nodes: [],
      onSelectLine: () => undefined,
    },
    referenceNavigation: {
      navigate: () => undefined,
      resolve: () => [],
    },
    updateSource: (change) => ({
      authoritativeSource: change.source,
      titleNormalized: false,
    }),
    ...overrides,
  };
}
