import { describe, expect, it, vi } from "vitest";
import { createLocalFirstVersionedRepository } from "../../../../infrastructure/client/repository/resilientVersionedRepository";
import { createMemoryVersionedRepositoryCache } from "../../../../infrastructure/client/repository/versionedRepositoryCache";
import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryUnavailableError,
} from "../../../../application/persistence/versionedRepository";

type Content = { records: Array<{ done: boolean; text: string }> };
type Revision = `revision:${number}`;
type LocalRevision = `local:${number}`;

function parseContent(value: unknown): Content {
  if (
    !value || typeof value !== "object" ||
    !Array.isArray((value as Partial<Content>).records)
  ) {
    throw new Error("invalid generic content");
  }
  return structuredClone(value as Content);
}

describe("local-first versioned repository", () => {
  it("prepares a cold snapshot once and stages an existing projection without re-preparing", async () => {
    const prepare = vi.fn(parseContent);
    let localIndex = 0;
    const repository = createLocalFirstVersionedRepository({
      backend: {
        commitRemoteSnapshot: async () => ({
          revision: "revision:2" as const,
        }),
        loadRemoteSnapshot: async () => ({
          content: { records: [] },
          revision: "revision:1" as const,
        }),
      },
      cache: createMemoryVersionedRepositoryCache<
        Content,
        Revision,
        LocalRevision
      >(),
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      location: { kind: "memory" },
      repositoryIdentity: "generic:preparation-count",
      preparation: { prepare },
    });
    const initial = await repository.loadSnapshot();

    expect(prepare).toHaveBeenCalledTimes(1);
    expect((await repository.loadSnapshot()).projection).toBe(
      initial.projection,
    );
    expect(prepare).toHaveBeenCalledTimes(1);

    const content = { records: [{ done: false, text: "prepared" }] };
    const projection = parseContent(content);

    await repository.stageSnapshot({
      content,
      expectedLocalRevision: initial.localRevision,
      projection,
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect((await repository.loadSnapshot()).projection).toBe(projection);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("persists an injected content model without WorkspaceData semantics", async () => {
    const commit = vi.fn(async () => ({ revision: "revision:2" as const }));
    let localIndex = 0;
    const repository = createLocalFirstVersionedRepository({
      backend: {
        commitRemoteSnapshot: commit,
        loadRemoteSnapshot: async () => ({
          content: { records: [] },
          revision: "revision:1" as const,
        }),
      },
      cache: createMemoryVersionedRepositoryCache<
        Content,
        Revision,
        LocalRevision
      >(),
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      location: { kind: "memory" },
      repositoryIdentity: "generic:one",
      preparation: { prepare: parseContent },
    });
    const initial = await repository.loadSnapshot();
    const content = { records: [{ done: false, text: "independent" }] };

    await repository.stageSnapshot({
      content,
      expectedLocalRevision: initial.localRevision,
      projection: parseContent(content),
    });
    await expect(repository.synchronizePendingSnapshot()).resolves.toMatchObject({
      pendingChanges: false,
      remoteRevision: "revision:2",
      status: "synced",
    });
    expect(commit).toHaveBeenCalledWith({
      baseRevision: "revision:1",
      content,
    });
  });

  it("preserves cached local content across offline reload and projects CAS conflict", async () => {
    const cache = createMemoryVersionedRepositoryCache<
      Content,
      Revision,
      LocalRevision
    >();
    let offline = false;
    let localIndex = 0;
    const repository = createLocalFirstVersionedRepository({
      backend: {
        async commitRemoteSnapshot() {
          throw new VersionedRepositoryBackendConflictError(
            "revision:9" as Revision,
          );
        },
        async loadRemoteSnapshot() {
          if (offline) {
            throw new VersionedRepositoryUnavailableError("offline");
          }
          return {
            content: { records: [] },
            revision: "revision:1" as Revision,
          };
        },
      },
      cache,
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      location: { kind: "memory" },
      refreshRemoteOnLoad: true,
      repositoryIdentity: "generic:two",
      preparation: { prepare: parseContent },
    });
    const initial = await repository.loadSnapshot();

    const content = { records: [{ done: true, text: "cached" }] };

    await repository.stageSnapshot({
      content,
      expectedLocalRevision: initial.localRevision,
      projection: parseContent(content),
    });
    offline = true;
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      content: { records: [{ done: true, text: "cached" }] },
      pendingChanges: true,
    });
    await expect(repository.synchronizePendingSnapshot()).resolves.toMatchObject({
      remoteRevision: "revision:9",
      status: "conflict",
    });
  });
});
