import type { NoteWorkspace } from "../domain/notes";

export type NoteRepository = {
  loadWorkspace: () => NoteWorkspace | null;
  saveWorkspace: (workspace: NoteWorkspace) => void;
  clearWorkspace: () => void;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const localWorkspaceStorageKey = "cognition-tree.local-workspace.v2";

export function createLocalStorageNoteRepository(
  storage: StorageLike = window.localStorage,
): NoteRepository {
  return {
    loadWorkspace() {
      const rawWorkspace = storage.getItem(localWorkspaceStorageKey);

      if (!rawWorkspace) {
        return null;
      }

      return JSON.parse(rawWorkspace) as NoteWorkspace;
    },
    saveWorkspace(workspace) {
      storage.setItem(localWorkspaceStorageKey, JSON.stringify(workspace));
    },
    clearWorkspace() {
      storage.removeItem(localWorkspaceStorageKey);
    },
  };
}
