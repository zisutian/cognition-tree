import type { NoteWorkspace } from "../domain/notes";
import { defaultCtnSyntaxProfile } from "../syntax/defaultSyntaxProfile";
import {
  formatSyntaxProfileToml,
  parseSyntaxProfileToml,
} from "../syntax/profileToml";
import type {
  WorkspaceRepository,
  RepositoryInfo,
  SyntaxProfileFile,
} from "./workspaceRepository";

const workspaceStorageKey = "cognition-tree.workspace";
const repositoryLabelStorageKey = "cognition-tree.repository-label";
const syntaxFilesStorageKey = "cognition-tree.syntax-files";
const defaultSyntaxFileName = `${defaultCtnSyntaxProfile.id}.toml`;

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

  return {
    ...(JSON.parse(storedWorkspace) as NoteWorkspace),
    syntaxProfiles: loadStoredSyntaxFiles().map((file) => file.profile),
  };
}

function createDefaultSyntaxProfileFile(): SyntaxProfileFile {
  return {
    fileName: defaultSyntaxFileName,
    profile: defaultCtnSyntaxProfile,
    source: formatSyntaxProfileToml(defaultCtnSyntaxProfile),
  };
}

function loadStoredSyntaxFiles() {
  const storedSyntaxFiles = globalThis.localStorage?.getItem(syntaxFilesStorageKey);

  if (!storedSyntaxFiles) {
    return [createDefaultSyntaxProfileFile()];
  }

  return JSON.parse(storedSyntaxFiles) as SyntaxProfileFile[];
}

function saveStoredSyntaxFiles(files: SyntaxProfileFile[]) {
  globalThis.localStorage?.setItem(syntaxFilesStorageKey, JSON.stringify(files));
}

function parseSyntaxProfileFile(fileName: string, source: string) {
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

function assertNoDuplicateSyntaxProfiles(files: SyntaxProfileFile[]) {
  const profileKeys = new Map<string, string>();

  for (const file of files) {
    const key = `${file.profile.id}@${file.profile.version}`;
    const existingFileName = profileKeys.get(key);

    if (existingFileName) {
      throw new Error(
        `Duplicate syntax profile ${key}: ${existingFileName}, ${file.fileName}`,
      );
    }

    profileKeys.set(key, file.fileName);
  }
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
      globalThis.localStorage?.removeItem(syntaxFilesStorageKey);
    },
    async getRepositoryInfo(): Promise<RepositoryInfo> {
      return {
        path: getRepositoryLabel(),
      };
    },
    async listSyntaxFiles() {
      const files = loadStoredSyntaxFiles();
      assertNoDuplicateSyntaxProfiles(files);
      return files;
    },
    async readSyntaxFile(fileName) {
      const file = loadStoredSyntaxFiles().find(
        (candidate) => candidate.fileName === fileName,
      );

      if (!file) {
        throw new Error(`Syntax profile file not found: ${fileName}`);
      }

      return file;
    },
    async saveSyntaxFile(fileName, source) {
      const nextFile = parseSyntaxProfileFile(fileName, source);
      const files = loadStoredSyntaxFiles().filter(
        (file) => file.fileName !== fileName,
      );
      const nextFiles = [...files, nextFile].sort((left, right) =>
        left.fileName.localeCompare(right.fileName),
      );

      assertNoDuplicateSyntaxProfiles(nextFiles);
      saveStoredSyntaxFiles(nextFiles);
    },
    async deleteSyntaxFile(fileName) {
      const files = loadStoredSyntaxFiles();
      const target = files.find((file) => file.fileName === fileName);

      if (!target) {
        throw new Error(`Syntax profile file not found: ${fileName}`);
      }

      if (files.length <= 1) {
        throw new Error("Cannot delete the last syntax profile file");
      }

      const workspace = loadStoredWorkspace();

      if (workspace?.defaultSyntaxProfileId === target.profile.id) {
        throw new Error(
          `Cannot delete repository default syntax profile: ${target.profile.id}`,
        );
      }

      const referencingNote = workspace?.notes.find(
        (note) =>
          note.syntaxProfileId === target.profile.id &&
          note.syntaxVersion === target.profile.version,
      );

      if (referencingNote) {
        throw new Error(`Cannot delete syntax profile used by note: ${referencingNote.id}`);
      }

      saveStoredSyntaxFiles(files.filter((file) => file.fileName !== fileName));
    },
    async setRepositoryPath(path) {
      globalThis.localStorage?.setItem(repositoryLabelStorageKey, path);

      return loadStoredWorkspace();
    },
  };
}
