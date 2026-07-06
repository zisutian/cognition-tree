import {
  type RepositoryInfo,
  type WorkspaceRepository,
} from "./workspaceRepository";
import { workspaceSyntaxFileName } from "../workspace/context/workspaceSyntaxFile";
import { parseWorkspaceDataDto } from "./workspaceDto";

const workspaceStorageKey = "cognition-tree.workspace";
const repositoryLabelStorageKey = "cognition-tree.repository-label";
const workspaceSyntaxSourceStorageKey = "cognition-tree.syntax-file";

function getRepositoryLabel() {
  return (
    globalThis.localStorage?.getItem(repositoryLabelStorageKey) ??
    `localStorage:${workspaceStorageKey}`
  );
}

function loadStoredWorkspace() {
  const storedWorkspace = globalThis.localStorage?.getItem(workspaceStorageKey);

  if (!storedWorkspace) {
    return null;
  }

  return parseWorkspaceDataDto(JSON.parse(storedWorkspace));
}

function loadStoredWorkspaceSyntaxSourceFile() {
  const storedWorkspaceSyntaxSource = globalThis.localStorage?.getItem(
    workspaceSyntaxSourceStorageKey,
  );

  if (!storedWorkspaceSyntaxSource) {
    return null;
  }

  return {
    fileName: workspaceSyntaxFileName,
    source: storedWorkspaceSyntaxSource,
  };
}

function saveStoredWorkspaceSyntaxSource(source: string) {
  globalThis.localStorage?.setItem(workspaceSyntaxSourceStorageKey, source);
}

export function createBrowserWorkspaceRepository(): WorkspaceRepository {
  return {
    label: "浏览器本地存储",
    canChangeRepositoryPath: true,
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
      globalThis.localStorage?.removeItem(workspaceSyntaxSourceStorageKey);
    },
    async getRepositoryInfo(): Promise<RepositoryInfo> {
      return {
        path: getRepositoryLabel(),
      };
    },
    async readWorkspaceSyntaxSourceFile() {
      return loadStoredWorkspaceSyntaxSourceFile();
    },
    async saveWorkspaceSyntaxSource(source) {
      saveStoredWorkspaceSyntaxSource(source);
    },
    async setRepositoryPath(path) {
      globalThis.localStorage?.setItem(repositoryLabelStorageKey, path);

      return loadStoredWorkspace();
    },
  };
}
