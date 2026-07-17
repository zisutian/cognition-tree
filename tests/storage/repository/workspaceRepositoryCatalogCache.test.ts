import { describe, expect, it } from "vitest";
import {
  createMemoryWorkspaceRepositoryCatalogCache,
  parseWorkspaceRepositoryCatalogCacheState,
} from "../../../src/storage/repository/workspaceRepositoryCatalogCache";

const descriptor = {
  adapter: "webdav" as const,
  id: "remote",
  label: "Stable catalog label",
  locationLabel: "WebDAV · remote",
};
const issue = {
  adapter: "local" as const,
  code: "repository_corrupt" as const,
  id: "broken",
  locationLabel: "Local · broken",
  message: "Repository head is invalid",
  status: "fault" as const,
};

describe("workspace repository catalog cache", () => {
  it("strictly parses v3 descriptors and per-repository issues", () => {
    const state = {
      creatableAdapters: ["local" as const, "webdav" as const],
      issues: [issue],
      repositories: [descriptor],
      version: 3 as const,
    };

    expect(parseWorkspaceRepositoryCatalogCacheState(state)).toEqual(state);
    expect(() =>
      parseWorkspaceRepositoryCatalogCacheState({
        ...state,
        repositoryPath: "/private/repositories",
      }),
    ).toThrow("Unsupported repository catalog cache version");
    expect(() =>
      parseWorkspaceRepositoryCatalogCacheState({ ...state, version: 2 }),
    ).toThrow("Unsupported repository catalog cache version");
  });

  it("isolates cached labels, location labels, and issues from mutation", async () => {
    const cache = createMemoryWorkspaceRepositoryCatalogCache();
    const state = {
      creatableAdapters: ["local" as const, "webdav" as const],
      issues: [{ ...issue }],
      repositories: [{ ...descriptor }],
      version: 3 as const,
    };

    await cache.save("catalog", state);
    state.repositories[0]!.label = "Mutated";
    state.issues[0]!.message = "Mutated";

    await expect(cache.load("catalog")).resolves.toEqual({
      creatableAdapters: ["local", "webdav"],
      issues: [issue],
      repositories: [descriptor],
      version: 3,
    });
  });
});
