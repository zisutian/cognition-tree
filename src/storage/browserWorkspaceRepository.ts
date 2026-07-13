import {
  WorkspaceRepositoryConflictError,
  type WorkspaceRepository,
  type WorkspaceRepositoryContent,
} from "./workspaceRepository";
import { parseWorkspaceRepositoryContent } from "../../contracts/workspace-repository/parseRepository";
import { createWorkspaceRepositoryRevision } from "./workspaceRepositoryRevision";
import { createInitialWorkspaceData } from "../workspace/model/workspaceData";

const repositoryStorageKey = "cognition-tree.repository";

function getStorage() {
  if (!globalThis.localStorage) {
    throw new Error("Browser local storage is unavailable");
  }

  return globalThis.localStorage;
}

function loadStoredContent(): WorkspaceRepositoryContent | null {
  const storedContent = getStorage().getItem(repositoryStorageKey);

  return storedContent
    ? parseWorkspaceRepositoryContent(JSON.parse(storedContent))
    : null;
}

export function createBrowserWorkspaceRepository(): WorkspaceRepository {
  const loadSnapshot: WorkspaceRepository["loadSnapshot"] = async () => {
    const content = loadStoredContent();
    const snapshotContent = content ?? {
      syntaxSourceFile: null,
      workspace: createInitialWorkspaceData(),
    };

    return {
      ...snapshotContent,
      repositoryPath: `localStorage:${repositoryStorageKey}`,
      revision: await createWorkspaceRepositoryRevision(snapshotContent),
    };
  };

  return {
    label: "浏览器本地存储",
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

      getStorage().setItem(repositoryStorageKey, JSON.stringify(content));

      return {
        revision: await createWorkspaceRepositoryRevision(content),
      };
    },
    loadSnapshot,
  };
}
