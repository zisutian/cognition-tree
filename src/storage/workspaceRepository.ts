import type { WorkspaceData } from "../domain/notes";
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
  loadWorkspace: () => Promise<WorkspaceData | null>;
  saveWorkspace: (workspace: WorkspaceData) => Promise<void>;
  clearWorkspace: () => Promise<void>;
  getRepositoryInfo: () => Promise<RepositoryInfo>;
  readSyntaxFile: () => Promise<WorkspaceSyntaxFile>;
  saveSyntaxFile: (source: string) => Promise<void>;
  setRepositoryPath?: (path: string) => Promise<WorkspaceData | null>;
};
