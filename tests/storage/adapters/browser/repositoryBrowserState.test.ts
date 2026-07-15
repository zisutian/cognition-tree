import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBrowserActiveRepositorySelection,
} from "../../../../src/storage/adapters/browser/browserActiveRepositorySelection";
import {
  loadRepositoryContextWidth,
  saveRepositoryContextWidth,
} from "../../../../src/ui/workbenchLayoutStorage";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("repository browser state", () => {
  it("stores the active repository for the current browser", () => {
    const selection = createBrowserActiveRepositorySelection();

    expect(selection.load()).toBeNull();
    selection.save("second");
    expect(selection.load()).toBe("second");
  });

  it("keeps context widths isolated and clamped by repository id", () => {
    saveRepositoryContextWidth("first", 100);
    saveRepositoryContextWidth("second", 360);

    expect(loadRepositoryContextWidth("first")).toBe(220);
    expect(loadRepositoryContextWidth("second")).toBe(360);
    expect(loadRepositoryContextWidth("third")).toBeNull();
  });
});
