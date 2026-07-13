import { describe, expect, it } from "vitest";
import type { WorkspaceRepository } from "../../../../src/storage/workspaceRepository";
import { createInitialWorkspaceData } from "../../../../src/workspace/model/workspaceData";
import { createDefaultWorkspaceSyntaxSource } from "../../../../src/workspace/context/workspaceSyntaxFile";
import { loadWorkspaceSessionSnapshot } from "../../../../src/application/workspace/session/sessionRepositorySnapshot";

function createRepository(
  snapshot: Awaited<ReturnType<WorkspaceRepository["loadSnapshot"]>>,
): WorkspaceRepository {
  return {
    commitSnapshot: async () => ({ revision: "unused" }),
    label: "test repository",
    loadSnapshot: async () => snapshot,
  };
}

describe("loadWorkspaceSessionSnapshot", () => {
  it("loads one repository snapshot and resolves its syntax profile", async () => {
    const workspace = createInitialWorkspaceData();
    const source = createDefaultWorkspaceSyntaxSource();
    const syntaxSourceFile = {
      fileName: "workspace.toml",
      source,
    };

    await expect(
      loadWorkspaceSessionSnapshot(
        createRepository({
          repositoryPath: "/repository",
          revision: "revision-1",
          syntaxSourceFile,
          workspace,
        }),
      ),
    ).resolves.toMatchObject({
      repositoryPath: "/repository",
      revision: "revision-1",
      syntaxSourceFile,
      workspaceData: workspace,
      workspaceSyntaxFile: {
        fileName: "workspace.toml",
        source,
      },
    });
  });

  it("keeps an unconfigured repository syntax explicit", async () => {
    const workspace = createInitialWorkspaceData();

    await expect(
      loadWorkspaceSessionSnapshot(
        createRepository({
          repositoryPath: "/repository",
          revision: "revision-empty-syntax",
          syntaxSourceFile: null,
          workspace,
        }),
      ),
    ).resolves.toEqual({
      repositoryPath: "/repository",
      revision: "revision-empty-syntax",
      syntaxSourceFile: null,
      workspaceData: workspace,
      workspaceSyntaxFile: null,
    });
  });
});
