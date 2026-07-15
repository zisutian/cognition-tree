import { describe, expect, it } from "vitest";
import {
  createMemoryWorkspaceRepositoryCatalogCache,
  parseWorkspaceRepositoryCatalogCacheState,
} from "../../../src/storage/repository/workspaceRepositoryCatalogCache";

const descriptor = {
  adapter: "webdav" as const,
  id: "remote",
  label: "Remote",
  repositoryPath: "https://dav.test/remote/",
};

describe("workspace repository catalog cache", () => {
  it("strictly parses versioned repository descriptors", () => {
    expect(
      parseWorkspaceRepositoryCatalogCacheState({
        repositories: [descriptor],
        version: 1,
      }),
    ).toEqual({ repositories: [descriptor], version: 1 });
    expect(() =>
      parseWorkspaceRepositoryCatalogCacheState({
        repositories: [descriptor],
        unexpected: true,
        version: 1,
      }),
    ).toThrow("Invalid repository catalog cache state");
  });

  it("isolates cached descriptors from caller mutation", async () => {
    const cache = createMemoryWorkspaceRepositoryCatalogCache();
    const state = { repositories: [{ ...descriptor }], version: 1 as const };

    await cache.save("catalog", state);
    state.repositories[0]!.label = "Mutated";

    await expect(cache.load("catalog")).resolves.toEqual({
      repositories: [
        {
          adapter: "webdav",
          id: "remote",
          label: "Remote",
          repositoryPath: "https://dav.test/remote/",
        },
      ],
      version: 1,
    });
  });
});
