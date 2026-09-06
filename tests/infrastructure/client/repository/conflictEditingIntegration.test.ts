import { describe, expect, it, vi } from "vitest";
import { createLocalFirstVersionedRepository } from "../../../../application/persistence/localFirst/localFirstRepository";
import { createMemoryVersionedRepositoryCache } from "../../../../infrastructure/client/repository/versionedRepositoryCache";
import { createVersionedSessionController } from "../../../../application/persistence/versionedSessionController";
import { VersionedRepositoryBackendMergeConflictError, type VersionedContentMergePolicy, type VersionedRepositoryBackend } from "../../../../application/persistence/versionedRepository";
import { mergeThreeWayValue } from "../../../../application/persistence/threeWayMerge";

type Content = { first: string; second: string };
type Projection = { length: number };
const prepare = (content: Content): Projection => ({ length: content.first.length + content.second.length });
const merge: VersionedContentMergePolicy<Content, Projection> = (base, local, remote, preference) => {
  const first = mergeThreeWayValue("first", base.content.first, local.content.first, remote.content.first, preference);
  const second = mergeThreeWayValue("second", base.content.second, local.content.second, remote.content.second, preference);
  const unitIds = [first.conflict, second.conflict].filter((value): value is string => value !== null);
  if (unitIds.length && !preference) return { status: "conflict", unitIds };
  const content = { first: first.value, second: second.value };
  return { content, projection: prepare(content), status: "merged" };
};

describe("editing a stored conflict", () => {
  it("automatically synchronizes remaining local changes after editing clears the conflict", async () => {
    let remote: Content = { first: "base", second: "base" };
    let revision = 1;
    let localRevision = 0;
    const backend: VersionedRepositoryBackend<Content, string> = {
      async loadRemoteSnapshot() { return { content: structuredClone(remote), revision: `remote:${revision}` }; },
      async synchronizeRemoteSnapshot({ base, content }) {
        const result = merge({ content: base.content, projection: prepare(base.content) }, { content, projection: prepare(content) }, { content: remote, projection: prepare(remote) });
        if (result.status === "conflict") throw new VersionedRepositoryBackendMergeConflictError({
          baseRevision: base.revision, currentRevision: `remote:${revision}`, unitIds: result.unitIds,
        });
        remote = result.content;
        return { outcome: "committed", snapshot: { content: remote, revision: `remote:${++revision}` } };
      },
    };
    const repository = createLocalFirstVersionedRepository({
      backend, cache: createMemoryVersionedRepositoryCache<Content, string, string>(),
      createLocalRevision: () => `local:${++localRevision}`, label: "conflict integration",
      loadPolicy: { mode: "cache-first" }, location: { type: "memory" },
      mergeContent: merge, preparation: { prepare }, repositoryIdentity: "conflict-integration",
    });
    const session = createVersionedSessionController({ label: "conflict integration", repository, scheduler: { schedule: () => () => undefined } });
    try {
      session.start();
      await vi.waitFor(() => expect(session.getState().status).toBe("ready"));
      const local = { first: "local", second: "keep local" };
      session.mutate(() => ({ content: local, projection: prepare(local) }));
      await session.flushPendingChanges();
      remote = { first: "remote", second: "base" };
      revision++;
      await expect(session.synchronizePendingChanges()).rejects.toThrow("conflict");
      const edited = { first: "remote", second: "keep local" };
      session.mutate(() => ({ content: edited, projection: prepare(edited) }));
      await session.flushPendingChanges();
      await vi.waitFor(() => {
        const state = session.getState();
        expect(state.status).toBe("ready");
        if (state.status !== "ready") throw new Error("Session is not ready");
        expect(state.persistence.status).toBe("saved");
        expect(remote).toEqual(edited);
      });
      expect(await repository.loadConflict()).toBeNull();
      await expect(session.synchronizePendingChanges()).resolves.toBeUndefined();
    } finally { session.dispose(); }
  });
});
