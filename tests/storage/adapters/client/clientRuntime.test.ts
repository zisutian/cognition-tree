// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClientActiveRepositorySelection,
} from "../../../../infrastructure/client/clientActiveRepositorySelection";
import {
  parseClientApiBaseUrl,
  parseClientStartupConfiguration,
} from "../../../../infrastructure/client/clientApiConfiguration";

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

describe("client runtime", () => {
  it("stores only the active repository preference in localStorage", () => {
    const selection = createClientActiveRepositorySelection();

    expect(selection.load()).toBeNull();
    selection.save("second");
    expect(selection.load()).toBe("second");
    expect(globalThis.localStorage.length).toBe(1);
    expect(globalThis.localStorage.key(0)).toBe(
      "cognition-tree.active-repository",
    );
    selection.clear();
    expect(selection.load()).toBeNull();
  });

  it("normalizes the startup configuration API origin and owner token", () => {
    expect(parseClientApiBaseUrl("https://api.example.test/")).toBe(
      "https://api.example.test",
    );
    expect(parseClientStartupConfiguration({
      apiBaseUrl: "http://127.0.0.1:3001",
      apiToken: "owner-token",
      formatVersion: 1,
    })).toEqual({
      baseUrl: "http://127.0.0.1:3001",
      token: "owner-token",
    });
  });
});
