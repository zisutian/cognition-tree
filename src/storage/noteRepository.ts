import type { NoteWorkspace } from "../domain/notes";

export type RepositoryInfo = {
  path: string;
};

export type NoteRepository = {
  label: string;
  canChangeRepositoryPath?: boolean;
  loadWorkspace: () => Promise<NoteWorkspace | null>;
  saveWorkspace: (workspace: NoteWorkspace) => Promise<void>;
  clearWorkspace: () => Promise<void>;
  getRepositoryInfo: () => Promise<RepositoryInfo>;
  setRepositoryPath?: (path: string) => Promise<NoteWorkspace | null>;
};
