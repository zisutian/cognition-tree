import { describe, expect, it } from "vitest";
import {
  createMemoryWorkspaceRepositoryCatalogCache,
  parseWorkspaceRepositoryCatalogCacheState,
} from "../../../infrastructure/persistence/workspaceRepositoryCatalogCache";

const descriptor = {
  adapter: "webdav" as const,
  id: "remote",
  label: "Stable catalog label",
  labelIssue: null,
  location: {
    type: "webdav" as const,
    url: "https://dav.example.test/notes/",
  },
};
const issue = {
  adapter: "local" as const,
  code: "repository_corrupt" as const,
  id: "broken",
  location: null,
  message: "Repository head is invalid",
  status: "fault" as const,
};

describe("workspace repository catalog cache", () => {
  it("strictly parses v4 descriptors and per-repository issues", () => {
    const state = {
      creatableAdapters: ["local" as const, "webdav" as const],
      issues: [issue],
      repositories: [descriptor],
      version: 4 as const,
    };

    expect(parseWorkspaceRepositoryCatalogCacheState(state)).toEqual(state);
    expect(() =>
      parseWorkspaceRepositoryCatalogCacheState({
        ...state,
        repositoryPath: "/private/repositories",
      }),
    ).toThrow("Unsupported repository catalog cache version");
    expect(() =>
      parseWorkspaceRepositoryCatalogCacheState({ ...state, version: 3 }),
    ).toThrow("Unsupported repository catalog cache version");
    expect(() =>
      parseWorkspaceRepositoryCatalogCacheState({
        ...state,
        repositories: [{
          adapter: "webdav",
          id: "unsupported",
          label: "Unsupported",
          unsupportedLocation: "WebDAV",
        }],
      }),
    ).toThrow("unsupported field");
  });

  it("rejects descriptors without the exact label issue projection", () => {
    const { labelIssue: _labelIssue, ...incompleteDescriptor } = descriptor;

    expect(() => parseWorkspaceRepositoryCatalogCacheState({
      creatableAdapters: ["webdav"],
      issues: [],
      repositories: [incompleteDescriptor],
      version: 4,
    })).toThrow("labelIssue: missing field");
  });

  it("isolates cached labels, structured locations, and issues from mutation", async () => {
    const cache = createMemoryWorkspaceRepositoryCatalogCache();
    const state = {
      creatableAdapters: ["local" as const, "webdav" as const],
      issues: [{ ...issue }],
      repositories: [{ ...descriptor }],
      version: 4 as const,
    };

    await cache.save("catalog", state);
    state.repositories[0]!.label = "Mutated";
    state.issues[0]!.message = "Mutated";

    await expect(cache.load("catalog")).resolves.toEqual({
      creatableAdapters: ["local", "webdav"],
      issues: [issue],
      repositories: [descriptor],
      version: 4,
    });
  });
});
