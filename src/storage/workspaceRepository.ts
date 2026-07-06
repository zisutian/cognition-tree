import type { WorkspaceData } from "../workspace/model/workspaceData";
import type { WorkspaceSyntaxSourceFile } from "../workspace/context/syntaxFile";

export type RepositoryInfo = {
  path: string;
};

export type WorkspaceRepository = {
  label: string;
  canChangeRepositoryPath?: boolean;
  loadWorkspace: () => Promise<WorkspaceData | null>;
  saveWorkspace: (workspace: WorkspaceData) => Promise<void>;
  clearWorkspace: () => Promise<void>;
  getRepositoryInfo: () => Promise<RepositoryInfo>;
  readSyntaxFile: () => Promise<WorkspaceSyntaxSourceFile | null>;
  saveSyntaxFile: (source: string) => Promise<void>;
  setRepositoryPath?: (path: string) => Promise<WorkspaceData | null>;
};
