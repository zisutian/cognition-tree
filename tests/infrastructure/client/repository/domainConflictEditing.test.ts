// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, it, vi } from "vitest";
import { createLocalFirstVersionedRepository, createVersionedSessionController, VersionedRepositoryBackendMergeConflictError, type VersionedContentMergePolicy, type VersionedRepositoryBackend } from "../../../../application/persistence/index.ts";
import { createMemoryVersionedRepositoryCache } from "../../../../infrastructure/client/repository/index.ts";
import { createJournalParseIndex } from "../../../../core/journal/index.ts";
import { createTodoParseIndex } from "../../../../core/todo/index.ts";
import { createCanonicalNoteSource } from "../../../../core/workspace/index.ts";
import { mergeJournalContent } from "../../../../application/journal/index.ts";
import { mergeTodoContent } from "../../../../application/todo/index.ts";
import { mergeWorkspaceContent } from "../../../../application/workspace/persistence/workspaceThreeWayMerge.ts";
import { prepareWorkspaceRepositoryContent } from "../../../../application/workspace/index.ts";
import { createContent as createWorkspace } from "../../../application/workspace/session/workspaceSessionTestFixture.ts";
import { appendJournalTestEntry, createEmptyJournalContent, updateJournalTestBody } from "../../../core/journal/journalTestFixture.ts";
import { appendTodoTestCollection, appendTodoTestItem, createEmptyTodoContent, todoTimestamp } from "../../../core/todo/todoTestFixture.ts";

type Scenario<Content, Projection> = {
  base: Content;
  local: Content;
  remote: Content;
  partial: Content;
  resolved: Content;
  prepare(content: Content): Projection;
  merge: VersionedContentMergePolicy<Content, Projection>;
};

async function verifyEditing<Content, Projection>(scenario: Scenario<Content, Projection>) {
  let remote = structuredClone(scenario.base);
  let revision = 1, localRevision = 0;
  const prepared = (content: Content) => ({ content, projection: scenario.prepare(content) });
  const backend: VersionedRepositoryBackend<Content, string> = {
    async loadRemoteSnapshot() { return { content: structuredClone(remote), revision: `remote:${revision}` }; },
    async synchronizeRemoteSnapshot({ base, content }) {
      const result = scenario.merge(prepared(base.content), prepared(content), prepared(remote));
      if (result.status === "conflict") throw new VersionedRepositoryBackendMergeConflictError({
        baseRevision: base.revision, currentRevision: `remote:${revision}`, unitIds: result.unitIds,
      });
      remote = result.content;
      return { outcome: "committed", snapshot: { content: remote, revision: `remote:${++revision}` } };
    },
  };
  const repository = createLocalFirstVersionedRepository({
    backend, cache: createMemoryVersionedRepositoryCache<Content, string, string>(),
    createLocalRevision: () => `local:${++localRevision}`, label: "domain conflict integration",
    loadPolicy: { mode: "cache-first" }, location: { kind: "memory" },
    mergeContent: scenario.merge, preparation: { prepare: scenario.prepare }, repositoryIdentity: "domain-conflict",
  });
  const session = createVersionedSessionController({
    repository, label: "domain conflict integration", scheduler: { schedule: () => () => undefined },
  });
  try {
    session.start();
    await vi.waitFor(() => expect(session.getState().status).toBe("ready"));
    session.mutate(() => prepared(scenario.local));
    await session.flushPendingChanges();
    remote = scenario.remote;
    revision++;
    await expect(session.synchronizePendingChanges()).rejects.toThrow("conflict");
    expect((await repository.loadConflict())?.unitIds).toHaveLength(2);
    expect(session.canMutate()).toBe(true);
    session.mutate(() => prepared(scenario.partial));
    await session.flushPendingChanges();
    expect((await repository.loadConflict())?.unitIds).toHaveLength(1);
    expect(remote).toEqual(scenario.remote);
    expect(session.canMutate()).toBe(true);
    session.mutate(() => prepared(scenario.resolved));
    await session.flushPendingChanges();
    await vi.waitFor(() => {
      const state = session.getState();
      expect(state.status).toBe("ready");
      if (state.status !== "ready") throw new Error("Session is not ready");
      expect(state.persistence.status).toBe("saved");
      expect(state.snapshot.conflictRevision).toBeNull();
      expect(state.content).toEqual(scenario.resolved);
    });
    expect(await repository.loadConflict()).toBeNull();
    expect(remote).toEqual(scenario.resolved);
  } finally { session.dispose(); }
}

it("continues Workspace edits through partial conflicts and automatically synchronizes all resolved units", async () => {
  const base = createWorkspace();
  base.workspace.notes = [1, 2, 3].map(index => ({
    id: `note-${index}`, source: createCanonicalNoteSource({
      blockId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      timestamp: "2026-07-18T00:00:00.000Z", title: "base",
    }),
  }));
  base.workspace.tree = base.workspace.notes.map(note => ({ kind: "note", noteId: note.id }));
  const local = structuredClone(base), remote = structuredClone(base);
  local.workspace.notes.forEach(note => { note.source = note.source.replace("\nbase", "\nlocal"); });
  remote.workspace.notes.slice(0, 2).forEach(note => { note.source = note.source.replace("\nbase", "\nremote"); });
  const partial = structuredClone(local);
  partial.workspace.notes[0] = remote.workspace.notes[0]!;
  const resolved = structuredClone(partial);
  resolved.workspace.notes[1] = remote.workspace.notes[1]!;
  await verifyEditing({ base, local, remote, partial, resolved, prepare: prepareWorkspaceRepositoryContent, merge: mergeWorkspaceContent });
});

it("continues Journal edits through partial conflicts and automatically synchronizes all resolved units", async () => {
  let base = createEmptyJournalContent();
  for (const index of [1, 2, 3]) {
    base = appendJournalTestEntry(base, { entryIndex: index, blockIdStart: index, createdAt: todoTimestamp(index), timezoneOffsetMinutes: 0 });
    base = updateJournalTestBody(base, { entryIndex: index, body: ": base", createBlockIdStart: 100 + index, updatedAt: todoTimestamp(4) });
  }
  let local = structuredClone(base), remote = structuredClone(base);
  for (const index of [1, 2, 3]) local = updateJournalTestBody(local, { entryIndex: index, previousBody: ": base", body: ": local", updatedAt: todoTimestamp(5) });
  for (const index of [1, 2]) remote = updateJournalTestBody(remote, { entryIndex: index, previousBody: ": base", body: ": remote", updatedAt: todoTimestamp(6) });
  const partial = structuredClone(local);
  partial.days[0]!.entries[0] = remote.days[0]!.entries[0]!;
  const resolved = structuredClone(partial);
  resolved.days[0]!.entries[1] = remote.days[0]!.entries[1]!;
  await verifyEditing({ base, local, remote, partial, resolved, prepare: createJournalParseIndex, merge: mergeJournalContent });
});

it("continues Todo edits through partial conflicts and automatically synchronizes all resolved units", async () => {
  let base = createEmptyTodoContent();
  for (const index of [1, 2, 3]) {
    base = appendTodoTestCollection(base, { collectionIndex: index });
    base = appendTodoTestItem(base, { collectionIndex: index, itemIndex: index, text: "base", createdAt: todoTimestamp(4) });
  }
  const local = structuredClone(base), remote = structuredClone(base);
  local.collections.forEach(collection => { collection.source = collection.source.replace("[] base", "[] local"); });
  remote.collections.slice(0, 2).forEach(collection => { collection.source = collection.source.replace("[] base", "[] remote"); });
  const partial = structuredClone(local);
  partial.collections[0] = remote.collections[0]!;
  const resolved = structuredClone(partial);
  resolved.collections[1] = remote.collections[1]!;
  await verifyEditing({ base, local, remote, partial, resolved, prepare: createTodoParseIndex, merge: mergeTodoContent });
});
