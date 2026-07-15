import {
  WorkspaceRepositoryConflictError,
  type WorkspaceRepository,
  type WorkspaceRepositoryContent,
} from "./workspaceRepository";
import {
  parseWorkspaceRepositoryContent,
} from "../../contracts/workspace-repository/parseRepository";
import {
  isRepositoryId,
  parseRepositoryCatalog,
} from "../../contracts/workspace-repository/parseCatalog";
import { createWorkspaceRepositoryRevision } from "./workspaceRepositoryRevision";
import type { WorkspaceRepositoryCatalog } from "./workspaceRepositoryCatalog";

const repositoryCatalogStorageKey = "cognition-tree.repositories";

function getStorage() {
  if (!globalThis.localStorage) {
    throw new Error("Browser local storage is unavailable");
  }

  return globalThis.localStorage;
}

function createRepositoryStorageKey(repositoryId: string) {
  return `${repositoryCatalogStorageKey}.${repositoryId}`;
}

function loadStoredContent(repositoryId: string): WorkspaceRepositoryContent {
  const storedContent = getStorage().getItem(
    createRepositoryStorageKey(repositoryId),
  );

  if (!storedContent) {
    throw new Error(`Browser repository does not exist: ${repositoryId}`);
  }

  return parseWorkspaceRepositoryContent(JSON.parse(storedContent));
}

function loadStoredCatalog() {
  const source = getStorage().getItem(repositoryCatalogStorageKey);

  return source
    ? parseRepositoryCatalog(JSON.parse(source)).repositories
    : [];
}

function saveStoredCatalog(
  repositories: ReturnType<typeof loadStoredCatalog>,
) {
  getStorage().setItem(
    repositoryCatalogStorageKey,
    JSON.stringify({ repositories }),
  );
}

function createBrowserWorkspaceRepository(
  repositoryId: string,
  label: string,
): WorkspaceRepository {
  const storageKey = createRepositoryStorageKey(repositoryId);
  const loadSnapshot: WorkspaceRepository["loadSnapshot"] = async () => {
    const content = loadStoredContent(repositoryId);

    return {
      ...content,
      availability: "online",
      repositoryPath: `localStorage:${storageKey}`,
      revision: await createWorkspaceRepositoryRevision(content),
    };
  };

  return {
    label,
    async commitSnapshot({
      baseRevision,
      syntaxSourceFile,
      workspace,
    }) {
      const currentSnapshot = await loadSnapshot();

      if (currentSnapshot.revision !== baseRevision) {
        throw new WorkspaceRepositoryConflictError(currentSnapshot.revision);
      }

      const content = { syntaxSourceFile, workspace };

      getStorage().setItem(storageKey, JSON.stringify(content));

      return {
        availability: "online",
        revision: await createWorkspaceRepositoryRevision(content),
      };
    },
    async discardPendingCommit() {},
    loadSnapshot,
  };
}

export function createBrowserWorkspaceRepositoryCatalog(): WorkspaceRepositoryCatalog {
  return {
    async createRepository(input) {
      if (!isRepositoryId(input.id)) {
        throw new Error(`Invalid browser repository id: ${input.id}`);
      }

      const repositories = loadStoredCatalog();

      if (repositories.some((repository) => repository.id === input.id)) {
        throw new Error(`Browser repository already exists: ${input.id}`);
      }

      const descriptor = {
        adapter: "browser" as const,
        id: input.id,
        label: input.content.workspace.name,
        repositoryPath: `localStorage:${createRepositoryStorageKey(input.id)}`,
      };

      getStorage().setItem(
        createRepositoryStorageKey(input.id),
        JSON.stringify(input.content),
      );
      saveStoredCatalog([...repositories, descriptor]);
      return descriptor;
    },
    label: "浏览器本地存储",
    async listRepositories() {
      return loadStoredCatalog();
    },
    openRepository(descriptor) {
      if (descriptor.adapter !== "browser") {
        throw new Error(
          `Browser catalog cannot open ${descriptor.adapter} repository: ${descriptor.id}`,
        );
      }

      return createBrowserWorkspaceRepository(
        descriptor.id,
        descriptor.label,
      );
    },
  };
}
