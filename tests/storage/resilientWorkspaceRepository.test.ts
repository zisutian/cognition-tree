import { describe, expect, it } from "vitest";
import { createResilientWorkspaceRepository } from "../../src/storage/resilientWorkspaceRepository";
import {
  WorkspaceRepositoryConflictError,
  WorkspaceRepositoryUnavailableError,
  type WorkspaceRepository,
  type WorkspaceRepositoryContent,
} from "../../src/storage/workspaceRepository";
import { createMemoryWorkspaceRepositoryCache } from "../../src/storage/workspaceRepositoryCache";
import { createInitialWorkspaceData } from "../../src/workspace/model/workspaceData";

function createContent(name: string): WorkspaceRepositoryContent {
  return {
    syntaxSourceFile: null,
    workspace: { ...createInitialWorkspaceData(), name },
  };
}

function createRemoteRepository() {
  let content = createContent("Remote");
  let revision = "revision-1";
  let unavailable = false;
  const commits: Array<{ baseRevision: string; name: string }> = [];
  const repository: WorkspaceRepository = {
    async commitSnapshot(commit) {
      if (unavailable) {
        throw new WorkspaceRepositoryUnavailableError();
      }
      if (commit.baseRevision !== revision) {
        throw new WorkspaceRepositoryConflictError(revision);
      }

      content = {
        syntaxSourceFile: commit.syntaxSourceFile,
        workspace: commit.workspace,
      };
      commits.push({
        baseRevision: commit.baseRevision,
        name: commit.workspace.name,
      });
      revision = `revision-${commits.length + 1}`;
      return { availability: "online", revision };
    },
    async discardPendingCommit() {},
    label: "Remote",
    async loadSnapshot() {
      if (unavailable) {
        throw new WorkspaceRepositoryUnavailableError();
      }

      return {
        ...content,
        availability: "online" as const,
        repositoryPath: "https://remote.test/repository/",
        revision,
      };
    },
  };

  return {
    commits,
    repository,
    setRemote(nextContent: WorkspaceRepositoryContent, nextRevision: string) {
      content = nextContent;
      revision = nextRevision;
    },
    setUnavailable(value: boolean) {
      unavailable = value;
    },
  };
}

function createRepository(
  remote: ReturnType<typeof createRemoteRepository>,
  cache = createMemoryWorkspaceRepositoryCache(),
) {
  return {
    cache,
    repository: createResilientWorkspaceRepository({
      cache,
      repository: remote.repository,
      repositoryIdentity: "https://api.test/#remote",
    }),
  };
}

describe("resilient workspace repository", () => {
  it("loads the confirmed snapshot while offline", async () => {
    const remote = createRemoteRepository();
    const { repository } = createRepository(remote);

    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      availability: "online",
      revision: "revision-1",
    });
    remote.setUnavailable(true);
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      availability: "offline",
      revision: "revision-1",
      workspace: { name: "Remote" },
    });
  });

  it("persists and replaces pending content across repository instances", async () => {
    const remote = createRemoteRepository();
    const { cache, repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();

    remote.setUnavailable(true);
    const first = await repository.commitSnapshot({
      ...createContent("Offline first"),
      baseRevision: initial.revision,
    });
    const latest = await repository.commitSnapshot({
      ...createContent("Offline latest"),
      baseRevision: first.revision,
    });
    const restored = createRepository(remote, cache).repository;

    expect(first.availability).toBe("offline");
    expect(latest.availability).toBe("offline");
    await expect(restored.loadSnapshot()).resolves.toMatchObject({
      availability: "offline",
      revision: latest.revision,
      workspace: { name: "Offline latest" },
    });
  });

  it("submits pending content with its original remote base after recovery", async () => {
    const remote = createRemoteRepository();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();

    remote.setUnavailable(true);
    await repository.commitSnapshot({
      ...createContent("Pending"),
      baseRevision: initial.revision,
    });
    remote.setUnavailable(false);

    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      availability: "online",
      revision: "revision-2",
      workspace: { name: "Pending" },
    });
    expect(remote.commits).toEqual([
      { baseRevision: "revision-1", name: "Pending" },
    ]);
  });

  it("keeps pending content in conflict until it is explicitly discarded", async () => {
    const remote = createRemoteRepository();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();

    remote.setUnavailable(true);
    const pending = await repository.commitSnapshot({
      ...createContent("Local pending"),
      baseRevision: initial.revision,
    });
    remote.setRemote(createContent("External"), "revision-external");
    remote.setUnavailable(false);

    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      availability: "conflict",
      currentRevision: "revision-external",
      revision: pending.revision,
      workspace: { name: "Local pending" },
    });
    await repository.discardPendingCommit();
    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      availability: "online",
      revision: "revision-external",
      workspace: { name: "External" },
    });
  });

  it("recognizes pending content that already reached the remote repository", async () => {
    const remote = createRemoteRepository();
    const { repository } = createRepository(remote);
    const initial = await repository.loadSnapshot();

    remote.setUnavailable(true);
    await repository.commitSnapshot({
      ...createContent("Already committed"),
      baseRevision: initial.revision,
    });
    remote.setRemote(createContent("Already committed"), "revision-remote");
    remote.setUnavailable(false);

    await expect(repository.loadSnapshot()).resolves.toMatchObject({
      availability: "online",
      revision: "revision-remote",
      workspace: { name: "Already committed" },
    });
  });
});
