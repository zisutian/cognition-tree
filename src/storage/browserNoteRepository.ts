import type { NoteWorkspace } from "../domain/notes";
import type { NoteRepository, RepositoryInfo } from "./noteRepository";

const workspaceStorageKey = "cognition-tree.workspace";
const repositoryLabelStorageKey = "cognition-tree.repository-label";

function getRepositoryLabel() {
  return (
    globalThis.localStorage?.getItem(repositoryLabelStorageKey) ??
    `localStorage:${workspaceStorageKey}`
  );
}

function loadStoredWorkspace() {
  const storedWorkspace = globalThis.localStorage?.getItem(workspaceStorageKey);

  return storedWorkspace ? (JSON.parse(storedWorkspace) as NoteWorkspace) : null;
}

export function createBrowserNoteRepository(): NoteRepository {
  return {
    label: "浏览器库",
    async loadWorkspace() {
      return loadStoredWorkspace();
    },
    async saveWorkspace(workspace) {
      globalThis.localStorage?.setItem(
        workspaceStorageKey,
        JSON.stringify(workspace),
      );
    },
    async clearWorkspace() {
      globalThis.localStorage?.removeItem(workspaceStorageKey);
    },
    async getRepositoryInfo(): Promise<RepositoryInfo> {
      return {
        path: getRepositoryLabel(),
      };
    },
    async setRepositoryPath(path) {
      globalThis.localStorage?.setItem(repositoryLabelStorageKey, path);

      return loadStoredWorkspace();
    },
  };
}
