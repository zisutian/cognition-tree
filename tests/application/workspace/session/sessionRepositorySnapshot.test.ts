import { describe, expect, it } from "vitest";
import {
  createWorkspaceRepositorySyntaxSourceFile,
  type WorkspaceRepository,
} from "../../../../src/storage/workspaceRepository";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../../src/workspace/model/workspaceData";
import { createDefaultWorkspaceSyntaxSource } from "../../../../src/workspace/context/workspaceSyntax";
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
    const syntaxSourceFile = createWorkspaceRepositorySyntaxSourceFile(source);

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
      workspaceSyntax: {
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
      workspaceSyntax: null,
    });
  });

  it("rejects configured repositories whose notes lack block metadata", async () => {
    const workspace = {
      ...createInitialWorkspaceData(),
      notes: [
        createNoteRecord(
          "note-raw",
          "Raw title",
          "2026-07-15T00:00:00.000Z",
        ),
      ],
    };

    await expect(
      loadWorkspaceSessionSnapshot(
        createRepository({
          repositoryPath: "/repository",
          revision: "revision-invalid-metadata",
          syntaxSourceFile: createWorkspaceRepositorySyntaxSourceFile(
            createDefaultWorkspaceSyntaxSource(),
          ),
          workspace,
        }),
      ),
    ).rejects.toThrow("expected @ctn-block directive");
  });
});
