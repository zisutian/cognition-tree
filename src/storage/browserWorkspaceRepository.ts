import {
  type RepositoryInfo,
  type WorkspaceRepository,
} from "./workspaceRepository";
import { workspaceSyntaxFileName } from "../workspace/context/syntaxFile";
import { parseWorkspaceDataDto } from "./workspaceDto";

const workspaceStorageKey = "cognition-tree.workspace";
const repositoryLabelStorageKey = "cognition-tree.repository-label";
const syntaxFileStorageKey = "cognition-tree.syntax-file";

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

function loadStoredSyntaxFile() {
  const storedSyntaxFile = globalThis.localStorage?.getItem(syntaxFileStorageKey);

  if (!storedSyntaxFile) {
    return null;
  }

  return {
    fileName: workspaceSyntaxFileName,
    source: storedSyntaxFile,
  };
}

function saveStoredSyntaxFile(source: string) {
  globalThis.localStorage?.setItem(syntaxFileStorageKey, source);
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
      globalThis.localStorage?.removeItem(syntaxFileStorageKey);
    },
    async getRepositoryInfo(): Promise<RepositoryInfo> {
      return {
        path: getRepositoryLabel(),
      };
    },
    async readSyntaxFile() {
      return loadStoredSyntaxFile();
    },
    async saveSyntaxFile(source) {
      saveStoredSyntaxFile(source);
    },
    async setRepositoryPath(path) {
      globalThis.localStorage?.setItem(repositoryLabelStorageKey, path);

      return loadStoredWorkspace();
    },
  };
}
