import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserWorkspaceRepository } from "../../src/storage/browserWorkspaceRepository";
import { WorkspaceRepositoryConflictError } from "../../src/storage/workspaceRepository";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBrowserWorkspaceRepository", () => {
  it("stores workspace and syntax together under one content key", async () => {
    const repository = createBrowserWorkspaceRepository();
    const initialSnapshot = await repository.loadSnapshot();
    const workspace = createInitialWorkspaceData();
    const content = {
      syntaxSourceFile: {
        fileName: "workspace.toml",
        source: 'name = "browser"\n',
      },
      workspace,
    };

    const result = await repository.commitSnapshot({
      ...content,
      baseRevision: initialSnapshot.revision,
    });

    await expect(repository.loadSnapshot()).resolves.toEqual({
      ...content,
      revision: result.revision,
    });
    expect(globalThis.localStorage.length).toBe(1);
    expect(
      JSON.parse(
        globalThis.localStorage.getItem("cognition-tree.repository") ?? "",
      ),
    ).toEqual(content);
  });

  it("detects content changed by another browser repository instance", async () => {
    const firstRepository = createBrowserWorkspaceRepository();
    const secondRepository = createBrowserWorkspaceRepository();
    const staleSnapshot = await firstRepository.loadSnapshot();
    const currentSnapshot = await secondRepository.loadSnapshot();

    await secondRepository.commitSnapshot({
      baseRevision: currentSnapshot.revision,
      syntaxSourceFile: null,
      workspace: {
        ...createInitialWorkspaceData(),
        name: "external",
      },
    });

    await expect(
      firstRepository.commitSnapshot({
        baseRevision: staleSnapshot.revision,
        syntaxSourceFile: null,
        workspace: {
          ...createInitialWorkspaceData(),
          name: "local",
        },
      }),
    ).rejects.toBeInstanceOf(WorkspaceRepositoryConflictError);
  });

  it("does not claim filesystem path switching support", async () => {
    const repository = createBrowserWorkspaceRepository();

    expect(repository.setRepositoryPath).toBeUndefined();
    await expect(repository.getRepositoryInfo()).resolves.toEqual({
      path: "localStorage:cognition-tree.repository",
    });
  });
});
