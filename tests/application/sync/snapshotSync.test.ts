// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  executeSnapshotSync,
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
      prepare: vi.fn(),
      projectChanges,
      request: { mode: "load" },
      runtime: { now: () => new Date("2026-08-19T00:00:00.000Z") },
      store,
    })).resolves.toEqual({
      content: { value: 1 },
      revision: revision("a"),
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
      prepare,
      projectChanges: ({ after, before, timestamp }) => ({
        after: after.projection.indexedValue,
        before: before.projection.indexedValue,
        timestamp,
      }),
      request: {
        baseRevision: revision("a"),
        content: { value: 2 },
        mode: "commit",
      },
      runtime: { now: () => new Date("2026-08-19T00:00:00.000Z") },
      store: { commit, loadSnapshot: async () => before },
    })).resolves.toEqual({
      changes: {
        after: 2,
        before: 1,
        timestamp: "2026-08-19T00:00:00.000Z",
      },
      revision: revision("b"),
      status: "committed",
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
      prepare,
      projectChanges: vi.fn(),
      request: {
        baseRevision: revision("a"),
        content: { value: 2 },
        mode: "commit",
      },
      runtime: { now: () => new Date(Number.NaN) },
      store: { commit, loadSnapshot },
    })).rejects.toThrow("Command time source returned an invalid date.");
    expect(commit).not.toHaveBeenCalled();
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });
});
