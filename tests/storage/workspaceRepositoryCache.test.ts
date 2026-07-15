import { describe, expect, it } from "vitest";
import {
  createMemoryWorkspaceRepositoryCache,
  parseWorkspaceRepositoryCacheState,
  type WorkspaceRepositoryCacheState,
} from "../../src/storage/workspaceRepositoryCache";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";

function createState(): WorkspaceRepositoryCacheState {
  const content = {
    syntaxSourceFile: null,
    workspace: createInitialWorkspaceData(),
  };

  return {
    confirmed: {
      ...content,
      repositoryPath: "/repository",
      revision: "revision-1",
    },
    pending: {
      baseRevision: "revision-1",
      content,
      localRevision: "local-revision-2",
      repositoryPath: "/repository",
    },
    version: 1,
  };
}

describe("workspace repository cache", () => {
  it("strictly parses the persisted cache format", () => {
    expect(parseWorkspaceRepositoryCacheState(createState())).toEqual(
      createState(),
    );
    expect(() =>
      parseWorkspaceRepositoryCacheState({
        ...createState(),
        unexpected: true,
      }),
    ).toThrow("Invalid repository cache state");
    expect(() =>
      parseWorkspaceRepositoryCacheState({ ...createState(), version: 2 }),
    ).toThrow("Unsupported repository cache version");
  });

  it("isolates persisted values from caller mutation", async () => {
    const cache = createMemoryWorkspaceRepositoryCache();
    const state = createState();
    const originalName = state.confirmed!.workspace.name;

    await cache.save("repository", state);
    state.confirmed!.workspace.name = "Mutated";

    await expect(cache.load("repository")).resolves.toMatchObject({
      confirmed: { workspace: { name: originalName } },
    });
  });
});
