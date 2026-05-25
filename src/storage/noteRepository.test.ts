import { describe, expect, it } from "vitest";
import { createInitialWorkspace } from "../domain/notes";
import { createLocalStorageNoteRepository } from "./noteRepository";

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("createLocalStorageNoteRepository", () => {
  it("saves and loads the local note workspace", () => {
    const repository = createLocalStorageNoteRepository(createMemoryStorage());
    const workspace = createInitialWorkspace("2026-05-25T00:00:00.000Z");

    repository.saveWorkspace(workspace);

    expect(repository.loadWorkspace()).toEqual(workspace);
  });
});
