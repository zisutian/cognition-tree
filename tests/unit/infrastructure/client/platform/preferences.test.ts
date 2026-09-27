// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClientActiveRepositorySelection,
} from "../../../../../infrastructure/client/platform/activeRepositorySelection";
import {
  createClientAgentProfilePreference,
} from "../../../../../infrastructure/client/platform/agentProfilePreference";
import { createClientContentTreeLabelPreference } from "../../../../../infrastructure/client/platform/contentTreeLabelPreference";
import { createClientTodoApplicationServices } from "../../../../../infrastructure/client/runtime/contentServices";

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
  it("restores the shared content tree label choice and defaults to visible for invalid storage", () => {
    const preference = createClientContentTreeLabelPreference();
    expect(preference.load()).toBe(true);
    preference.save(false);
    expect(createClientContentTreeLabelPreference().load()).toBe(false);
    preference.save(true);
    expect(preference.load()).toBe(true);
    globalThis.localStorage.setItem("cognition-tree.content-tree-type-labels", "invalid");
    expect(preference.load()).toBe(true);
  });

  it("keeps the content tree preference usable when browser storage fails", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("unavailable"); },
      setItem: () => { throw new Error("unavailable"); },
    });
    const preference = createClientContentTreeLabelPreference();
    expect(preference.load()).toBe(true);
    expect(() => preference.save(false)).not.toThrow();
  });

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

  it("provides browser-owned Todo runtime services", () => {
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
