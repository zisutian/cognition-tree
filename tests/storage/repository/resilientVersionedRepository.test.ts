import { describe, expect, it, vi } from "vitest";
import { createLocalFirstVersionedRepository } from "../../../infrastructure/persistence/resilientVersionedRepository";
import { createMemoryVersionedRepositoryCache } from "../../../infrastructure/persistence/versionedRepositoryCache";
import {
  VersionedRepositoryBackendConflictError,
  VersionedRepositoryUnavailableError,
} from "../../../application/repository/versionedRepository";

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

function parseRevision(value: unknown): Revision {
  if (typeof value !== "string" || !/^revision:\d+$/.test(value)) {
    throw new Error("invalid generic revision");
  }
  return value as Revision;
}

const codec = {
  parseContent,
  parseRevision,
  parseSnapshot(value: unknown) {
    if (!value || typeof value !== "object") {
      throw new Error("invalid generic snapshot");
    }
    const snapshot = value as { content?: unknown; revision?: unknown };
    return {
      content: parseContent(snapshot.content),
      revision: parseRevision(snapshot.revision),
    };
  },
};

describe("local-first versioned repository", () => {
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
      >({ codec }),
      createLocalRevision: () => `local:${localIndex += 1}`,
      label: "generic",
      location: { kind: "memory" },
      repositoryIdentity: "generic:one",
      validateContent: parseContent,
    });
    const initial = await repository.loadSnapshot();
    const content = { records: [{ done: false, text: "independent" }] };

    await repository.stageSnapshot({
      content,
      expectedLocalRevision: initial.localRevision,
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
    >({ codec });
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
      validateContent: parseContent,
    });
    const initial = await repository.loadSnapshot();

    await repository.stageSnapshot({
      content: { records: [{ done: true, text: "cached" }] },
      expectedLocalRevision: initial.localRevision,
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
