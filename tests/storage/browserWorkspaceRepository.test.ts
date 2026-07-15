import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserWorkspaceRepositoryCatalog } from "../../src/storage/browserWorkspaceRepository";
import {
  createWorkspaceRepositorySyntaxSourceFile,
  WorkspaceRepositoryConflictError,
  type WorkspaceRepositoryContent,
} from "../../src/storage/workspaceRepository";
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

function createContent(name: string): WorkspaceRepositoryContent {
  return {
    syntaxSourceFile: createWorkspaceRepositorySyntaxSourceFile(
      'name = "browser"\n',
    ),
    workspace: { ...createInitialWorkspaceData(), name },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser workspace repository catalog", () => {
  it("creates and lists isolated browser repositories", async () => {
    const catalog = createBrowserWorkspaceRepositoryCatalog();
    const firstContent = createContent("First");
    const first = await catalog.createRepository({
      content: firstContent,
      id: "first",
    });
    const second = await catalog.createRepository({
      content: createContent("Second"),
      id: "second",
    });

    await expect(catalog.listRepositories()).resolves.toEqual([first, second]);
    await expect(catalog.openRepository(first).loadSnapshot()).resolves
      .toMatchObject({
        ...firstContent,
        repositoryPath: "localStorage:cognition-tree.repositories.first",
      });
    await expect(catalog.openRepository(second).loadSnapshot()).resolves
      .toMatchObject({ workspace: { name: "Second" } });
    expect(globalThis.localStorage.length).toBe(3);
  });

  it("detects content changed by another instance of the same repository", async () => {
    const catalog = createBrowserWorkspaceRepositoryCatalog();
    const descriptor = await catalog.createRepository({
      content: createContent("Initial"),
      id: "shared",
    });
    const firstRepository = catalog.openRepository(descriptor);
    const secondRepository = catalog.openRepository(descriptor);
    const staleSnapshot = await firstRepository.loadSnapshot();
    const currentSnapshot = await secondRepository.loadSnapshot();

    await secondRepository.commitSnapshot({
      baseRevision: currentSnapshot.revision,
      ...createContent("External"),
    });

    await expect(
      firstRepository.commitSnapshot({
        baseRevision: staleSnapshot.revision,
        ...createContent("Local"),
      }),
    ).rejects.toBeInstanceOf(WorkspaceRepositoryConflictError);
  });

  it("rejects duplicate repository ids", async () => {
    const catalog = createBrowserWorkspaceRepositoryCatalog();

    await catalog.createRepository({ content: createContent("A"), id: "same" });
    await expect(
      catalog.createRepository({ content: createContent("B"), id: "same" }),
    ).rejects.toThrow("already exists");
  });

  it("rejects repository ids that cannot be used as catalog keys", async () => {
    const catalog = createBrowserWorkspaceRepositoryCatalog();

    await expect(
      catalog.createRepository({
        content: createContent("Invalid"),
        id: "../invalid",
      }),
    ).rejects.toThrow("Invalid browser repository id");
  });
});
