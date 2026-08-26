// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  executeSnapshotSync,
  SnapshotSyncBaseRevisionError,
  SnapshotSyncRetryExhaustedError,
  SnapshotSyncRevisionConflictError,
  type SnapshotSyncStore,
} from "../../../application/sync/snapshotSync.ts";

type Revision = `sha256:${string}`;
type Content = { value: number };
type Projection = { indexedValue: number };

const revision = (character: string) =>
  `sha256:${character.repeat(64)}` as Revision;

describe("snapshot sync", () => {
  it("loads the canonical prepared snapshot without projecting changes", async () => {
    const projectChanges = vi.fn();
    const store: SnapshotSyncStore<Content, Projection, Revision> = {
      commit: vi.fn(),
      loadSnapshot: async () => ({
        content: { value: 1 },
        projection: { indexedValue: 1 },
        revision: revision("a"),
      }),
    };

    await expect(executeSnapshotSync({
      merge: vi.fn(),
      prepare: vi.fn(),
      projectChanges,
      request: { mode: "load" },
      revisionOf: vi.fn(),
      runtime: { now: () => new Date("2026-08-19T00:00:00.000Z") },
      store,
    })).resolves.toEqual({
      snapshot: { content: { value: 1 }, revision: revision("a") },
      status: "loaded",
    });
    expect(projectChanges).not.toHaveBeenCalled();
  });

  it("commits the decoded snapshot and projects from prepared receipt state", async () => {
    const before = {
      content: { value: 1 },
      projection: { indexedValue: 1 },
      revision: revision("a"),
    };
    const after = {
      content: { value: 2 },
      projection: { indexedValue: 2 },
      revision: revision("b"),
    };
    const commit = vi.fn(async () => ({
      after,
      before,
      revision: revision("b"),
    }));
    const prepare = vi.fn(
      (content: Content): Projection => ({ indexedValue: content.value }),
    );

    await expect(executeSnapshotSync({
      merge: vi.fn(),
      prepare,
      projectChanges: ({ after, before, timestamp }) => ({
        after: after.projection.indexedValue,
        before: before.projection.indexedValue,
        timestamp,
      }),
      request: {
        base: { content: { value: 1 }, revision: revision("a") },
        content: { value: 2 },
        mode: "commit",
      },
      revisionOf: (content) => revision(content.value === 1 ? "a" : "b"),
      runtime: { now: () => new Date("2026-08-19T00:00:00.000Z") },
      store: { commit, loadSnapshot: async () => before },
    })).resolves.toEqual({
      changes: {
        after: 2,
        before: 1,
        timestamp: "2026-08-19T00:00:00.000Z",
      },
      outcome: "committed",
      snapshot: { content: { value: 2 }, revision: revision("b") },
      status: "synchronized",
    });
    expect(commit).toHaveBeenCalledWith({
      baseRevision: revision("a"),
      content: { value: 2 },
      projection: { indexedValue: 2 },
    });
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledWith(
      { value: 2 },
      before.projection,
    );
  });

  it("rejects an invalid clock before opening the commit transaction", async () => {
    const commit = vi.fn();
    const loadSnapshot = vi.fn();
    const prepare = vi.fn();

    await expect(executeSnapshotSync({
      merge: vi.fn(),
      prepare,
      projectChanges: vi.fn(),
      request: {
        base: { content: { value: 1 }, revision: revision("a") },
        content: { value: 2 },
        mode: "commit",
      },
      revisionOf: (content) => revision(content.value === 1 ? "a" : "b"),
      runtime: { now: () => new Date(Number.NaN) },
      store: { commit, loadSnapshot },
    })).rejects.toThrow("Command time source returned an invalid date.");
    expect(commit).not.toHaveBeenCalled();
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("auto-merges a stale base and projects only the final committed receipt", async () => {
    const current = {
      content: { value: 2 },
      projection: { indexedValue: 2 },
      revision: revision("b"),
    };
    const after = {
      content: { value: 4 },
      projection: { indexedValue: 4 },
      revision: revision("d"),
    };
    const projectChanges = vi.fn(() => ({ indexedValue: 4 }));
    const commit = vi.fn(async () => ({
      after,
      before: current,
      revision: revision("d"),
    }));

    await expect(executeSnapshotSync({
      merge: (_base, _local, _remote) => ({
        content: { value: 4 },
        projection: { indexedValue: 4 },
        status: "merged",
      }),
      prepare: (content) => ({ indexedValue: content.value }),
      projectChanges,
      request: {
        base: { content: { value: 1 }, revision: revision("a") },
        content: { value: 3 },
        mode: "commit",
      },
      revisionOf: (content) => revision(String.fromCharCode(96 + content.value)),
      runtime: { now: () => new Date("2026-08-19T00:00:00.000Z") },
      store: { commit, loadSnapshot: async () => current },
    })).resolves.toMatchObject({
      outcome: "auto-merged",
      snapshot: { content: { value: 4 }, revision: revision("d") },
      status: "synchronized",
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(projectChanges).toHaveBeenCalledOnce();
  });

  it("returns an unchanged snapshot without committing or publishing", async () => {
    const current = {
      content: { value: 2 },
      projection: { indexedValue: 2 },
      revision: revision("b"),
    };
    const commit = vi.fn();
    const projectChanges = vi.fn();

    await expect(executeSnapshotSync({
      merge: () => ({ ...current, status: "merged" }),
      prepare: (content) => ({ indexedValue: content.value }),
      projectChanges,
      request: {
        base: { content: { value: 1 }, revision: revision("a") },
        content: { value: 2 },
        mode: "commit",
      },
      revisionOf: (content) => revision(content.value === 1 ? "a" : "b"),
      runtime: { now: () => new Date("2026-08-19T00:00:00.000Z") },
      store: { commit, loadSnapshot: async () => current },
    })).resolves.toEqual({
      changes: null,
      outcome: "unchanged",
      snapshot: { content: { value: 2 }, revision: revision("b") },
      status: "synchronized",
    });
    expect(commit).not.toHaveBeenCalled();
    expect(projectChanges).not.toHaveBeenCalled();
  });

  it("rejects mismatched base content and reports overlapping merge units", async () => {
    const current = {
      content: { value: 2 },
      projection: { indexedValue: 2 },
      revision: revision("b"),
    };
    const common = {
      prepare: (content: Content) => ({ indexedValue: content.value }),
      projectChanges: vi.fn(),
      runtime: { now: () => new Date("2026-08-19T00:00:00.000Z") },
      store: { commit: vi.fn(), loadSnapshot: async () => current },
    };

    await expect(executeSnapshotSync({
      ...common,
      merge: vi.fn(),
      request: {
        base: { content: { value: 1 }, revision: revision("f") },
        content: { value: 3 },
        mode: "commit" as const,
      },
      revisionOf: () => revision("a"),
    })).rejects.toBeInstanceOf(SnapshotSyncBaseRevisionError);
    await expect(executeSnapshotSync({
      ...common,
      merge: () => ({ status: "conflict", unitIds: ["note:b", "note:a"] }),
      request: {
        base: { content: { value: 1 }, revision: revision("a") },
        content: { value: 3 },
        mode: "commit" as const,
      },
      revisionOf: (content) => revision(content.value === 1 ? "a" : "c"),
    })).rejects.toMatchObject({
      baseRevision: revision("a"),
      currentRevision: revision("b"),
      unitIds: ["note:a", "note:b"],
    });
  });

  it("recomputes after CAS races three times and then returns a retryable boundary error", async () => {
    const revisions = ["a", "b", "c"];
    let index = 0;
    const commit = vi.fn(async () => {
      const currentRevision = revision(String.fromCharCode(98 + index));

      index += 1;
      throw new SnapshotSyncRevisionConflictError(currentRevision);
    });

    await expect(executeSnapshotSync({
      merge: (_base, local) => ({ ...local, status: "merged" }),
      prepare: (content) => ({ indexedValue: content.value }),
      projectChanges: vi.fn(),
      request: {
        base: { content: { value: 1 }, revision: revision("a") },
        content: { value: 9 },
        mode: "commit",
      },
      revisionOf: (content) => content.value === 1
        ? revision("a")
        : revision("z"),
      runtime: { now: () => new Date("2026-08-19T00:00:00.000Z") },
      store: {
        commit,
        loadSnapshot: async () => ({
          content: { value: index + 1 },
          projection: { indexedValue: index + 1 },
          revision: revision(revisions[index]!),
        }),
      },
    })).rejects.toBeInstanceOf(SnapshotSyncRetryExhaustedError);
    expect(commit).toHaveBeenCalledTimes(3);
  });
});
