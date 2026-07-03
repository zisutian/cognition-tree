import { defaultCtnSyntaxProfile } from "../ctn-syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../ctn-syntax/profileToml";
import type {
  WorkspaceRepository,
  RepositoryInfo,
  WorkspaceSyntaxFile,
} from "./workspaceRepository";
import { parseWorkspaceDataDto } from "./workspaceDto";

const workspaceStorageKey = "cognition-tree.workspace";
const repositoryLabelStorageKey = "cognition-tree.repository-label";
const syntaxFileStorageKey = "cognition-tree.syntax-file";
const workspaceSyntaxFileName = "workspace.toml";

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

function createDefaultSyntaxFile(): WorkspaceSyntaxFile {
  return {
    fileName: workspaceSyntaxFileName,
    profile: defaultCtnSyntaxProfile,
    source: formatSyntaxProfileToml(defaultCtnSyntaxProfile),
  };
}

function loadStoredSyntaxFile() {
  const storedSyntaxFile = globalThis.localStorage?.getItem(syntaxFileStorageKey);

  if (!storedSyntaxFile) {
    return createDefaultSyntaxFile();
  }

  return parseWorkspaceSyntaxFile(workspaceSyntaxFileName, storedSyntaxFile);
}

function saveStoredSyntaxFile(source: string) {
  globalThis.localStorage?.setItem(syntaxFileStorageKey, source);
}

function parseWorkspaceSyntaxFile(fileName: string, source: string) {
  const result = parseSyntaxProfileToml(source);

  if (!result.profile) {
    const message = result.diagnostics
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join("; ");

    throw new Error(`Invalid syntax profile ${fileName}: ${message}`);
  }

  return {
    fileName,
    profile: result.profile,
    source,
  };
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
      parseWorkspaceSyntaxFile(workspaceSyntaxFileName, source);
      saveStoredSyntaxFile(source);
    },
    async setRepositoryPath(path) {
      globalThis.localStorage?.setItem(repositoryLabelStorageKey, path);

      return loadStoredWorkspace();
    },
  };
}
