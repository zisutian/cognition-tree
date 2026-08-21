// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClientActiveRepositorySelection,
} from "../../../../infrastructure/client/platform/activeRepositorySelection";
import {
  createClientAgentProfilePreference,
} from "../../../../infrastructure/client/platform/agentProfilePreference";
import {
  parseClientApiBaseUrl,
  parseClientStartupConfiguration,
} from "../../../../infrastructure/client/runtime/apiConfiguration";
import { createClientTodoApplicationServices } from "../../../../infrastructure/client/platform/applicationServices";

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
  it("stores repository and Agent profile preferences under separate keys", () => {
    const selection = createClientActiveRepositorySelection();
    const profile = createClientAgentProfilePreference();

    expect(selection.load()).toBeNull();
    selection.save("second");
    expect(selection.load()).toBe("second");
    expect(globalThis.localStorage.length).toBe(1);
    expect(globalThis.localStorage.key(0)).toBe(
      "cognition-tree.active-repository",
    );
    expect(profile.load()).toBeNull();
    profile.save("codex-safe");
    expect(profile.load()).toBe("codex-safe");
    expect(globalThis.localStorage.length).toBe(2);
    expect(globalThis.localStorage.key(1)).toBe(
      "cognition-tree.agent-profile",
    );
    selection.clear();
    expect(selection.load()).toBeNull();
    profile.clear();
    expect(profile.load()).toBeNull();
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
    const services = createClientTodoApplicationServices();

    expect(services.createCollectionId()).toMatch(
      /^todo-collection-[0-9a-f-]{36}$/,
    );
    expect(services.createBlockId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(services.createRecurrenceStageId()).toMatch(
      /^todo-recurrence-stage-[0-9a-f-]{36}$/,
    );
    expect(services.localCalendar.today()).toMatch(
      /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
    );
    expect(services.now()).toBeInstanceOf(Date);
  });
});
