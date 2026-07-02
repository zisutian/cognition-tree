import type { NoteWorkspace } from "../domain/notes";
import type { CtnSyntaxProfile } from "../syntax/types";

export type RepositoryInfo = {
  path: string;
};

export type WorkspaceSyntaxFile = {
  fileName: string;
  profile: CtnSyntaxProfile;
  source: string;
};

export type WorkspaceRepository = {
  label: string;
  canChangeRepositoryPath?: boolean;
  loadWorkspace: () => Promise<NoteWorkspace | null>;
  saveWorkspace: (workspace: NoteWorkspace) => Promise<void>;
  clearWorkspace: () => Promise<void>;
  getRepositoryInfo: () => Promise<RepositoryInfo>;
  readSyntaxFile: () => Promise<WorkspaceSyntaxFile>;
  saveSyntaxFile: (source: string) => Promise<void>;
  setRepositoryPath?: (path: string) => Promise<NoteWorkspace | null>;
};
