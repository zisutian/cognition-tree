import { afterEach, describe, expect, it } from "vitest";
import {
  defaultRepositoryProblemsLayout,
  loadRepositoryProblemsLayout,
  saveRepositoryProblemsLayout,
} from "../../../presentation/ui/workbench/workbenchLayoutStorage";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
  });
});

describe("workbench layout storage", () => {
  it("persists a versioned problems layout independently per repository", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });

    saveRepositoryProblemsLayout("alpha", { expanded: true, height: 248 });

    expect(loadRepositoryProblemsLayout("alpha")).toEqual({
      expanded: true,
      height: 248,
    });
    expect(loadRepositoryProblemsLayout("beta")).toEqual(
      defaultRepositoryProblemsLayout,
    );
  });

  it("falls back for invalid versions and clamps stored height", () => {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
    storage.setItem(
      "cognition-tree.problems-layout.invalid",
      JSON.stringify({ expanded: true, height: 240, version: 2 }),
    );

    expect(loadRepositoryProblemsLayout("invalid")).toEqual(
      defaultRepositoryProblemsLayout,
    );

    saveRepositoryProblemsLayout("clamped", { expanded: true, height: 999 });
    expect(loadRepositoryProblemsLayout("clamped").height).toBe(360);
  });
});
