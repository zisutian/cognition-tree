import { describe, expect, it } from "vitest";
import {
  createMemoryWorkspaceRepositoryCatalogCache,
  parseWorkspaceRepositoryCatalogCacheState,
} from "../../../../infrastructure/client/repository/workspaceRepositoryCatalogCache";

const descriptor = {
  id: "primary",
  label: "Stable catalog label",
  labelIssue: null,
  location: {
    hostPath: "/home/user/repositories/primary",
    serverPath: "/data/repositories/primary",
  },
};
const issue = {
  code: "repository_corrupt" as const,
  id: "broken",
  location: null,
  message: "Repository head is invalid",
};

describe("workspace repository catalog cache", () => {
  it("strictly parses v5 local descriptors and per-repository issues", () => {
    const state = {
      issues: [issue],
      repositories: [descriptor],
      version: 5 as const,
    };

    expect(parseWorkspaceRepositoryCatalogCacheState(state)).toEqual(state);
    expect(() =>
      parseWorkspaceRepositoryCatalogCacheState({
        ...state,
        repositoryPath: "/private/repositories",
      }),
    ).toThrow("Unsupported repository catalog cache version");
    expect(() =>
      parseWorkspaceRepositoryCatalogCacheState({ ...state, version: 4 }),
    ).toThrow("Unsupported repository catalog cache version");
    expect(() =>
      parseWorkspaceRepositoryCatalogCacheState({
        ...state,
        repositories: [{
          ...descriptor,
          unsupportedLocation: "remote",
        }],
      }),
    ).toThrow("unsupported field");
  });

  it("rejects descriptors without the exact label issue projection", () => {
    const { labelIssue: _labelIssue, ...incompleteDescriptor } = descriptor;

    expect(() => parseWorkspaceRepositoryCatalogCacheState({
      issues: [],
      repositories: [incompleteDescriptor],
      version: 5,
    })).toThrow("labelIssue: missing field");
  });

  it("isolates cached labels, structured locations, and issues from mutation", async () => {
    const cache = createMemoryWorkspaceRepositoryCatalogCache();
    const state = {
      issues: [{ ...issue }],
      repositories: [{ ...descriptor }],
      version: 5 as const,
    };

    await cache.save("catalog", state);
    state.repositories[0]!.label = "Mutated";
    state.issues[0]!.message = "Mutated";

    await expect(cache.load("catalog")).resolves.toEqual({
      issues: [issue],
      repositories: [descriptor],
      version: 5,
    });
  });
});
