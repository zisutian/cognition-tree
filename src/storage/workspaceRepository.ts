import type { WorkspaceData } from "../workspace/model/workspaceData";
import type { WorkspaceSyntaxSourceFile } from "../workspace/context/workspaceSyntaxFile";

export type RepositoryInfo = {
  path: string;
};

export type WorkspaceRepository = {
  label: string;
  canChangeRepositoryPath?: boolean;
  loadWorkspace: () => Promise<WorkspaceData | null>;
  saveWorkspace: (workspace: WorkspaceData) => Promise<void>;
  getRepositoryInfo: () => Promise<RepositoryInfo>;
  readWorkspaceSyntaxSourceFile: () => Promise<WorkspaceSyntaxSourceFile | null>;
  saveWorkspaceSyntaxSource: (source: string) => Promise<void>;
  setRepositoryPath?: (path: string) => Promise<WorkspaceData | null>;
};
