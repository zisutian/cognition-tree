// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createRepositorySessionKey,
  RepositorySessionStore,
  RepositorySessionStoreRegistry,
} from "../../../presentation/ui/workbench/repositorySessionStore";

describe("repository session store", () => {
  it("owns independent values for each repository", () => {
    const store = new RepositorySessionStore(() => ({ expanded: false }));

    store.update("repository-alpha", (current) => ({
      ...current,
      expanded: true,
    }));

    expect(store.read("repository-alpha")).toEqual({ expanded: true });
    expect(store.read("repository-beta")).toEqual({ expanded: false });
    expect(store.read("repository-alpha")).not.toBe(
      store.read("repository-beta"),
    );
  });

  it("notifies only subscribers of the changed repository", () => {
    const store = new RepositorySessionStore(() => 0);
    const alphaListener = vi.fn();
    const betaListener = vi.fn();
    const unsubscribe = store.subscribe("repository-alpha", alphaListener);

    store.subscribe("repository-beta", betaListener);
    store.update("repository-alpha", 1);
    store.update("repository-alpha", (current) => current);
    unsubscribe();
    store.update("repository-alpha", 2);

    expect(alphaListener).toHaveBeenCalledTimes(1);
    expect(betaListener).not.toHaveBeenCalled();
  });

  it("keeps named stores alive under the page-session registry", () => {
    const registry = new RepositorySessionStoreRegistry();
    const layoutKey = createRepositorySessionKey<number>("layout");
    const notesKey = createRepositorySessionKey<string>("notes");
    const layout = registry.get(layoutKey, () => 0);

    layout.update("repository-alpha", 280);

    expect(registry.get(layoutKey, () => 0)).toBe(layout);
    expect(registry.get(layoutKey, () => 0).read("repository-alpha"))
      .toBe(280);
    expect(registry.get(notesKey, () => "edit")).not.toBe(layout);
  });
});
