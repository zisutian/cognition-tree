import { describe, expect, it } from "vitest";
import { WorkspaceRepositoryLocalConflictError } from "../../../application/repository/workspaceRepository";
import { createMemoryWorkspaceRepositoryCache } from "../../../infrastructure/persistence/workspaceRepositoryCache";
import {
  createWorkspaceRepositoryContent,
  draftA,
  draftB,
  draftC,
  revisionA,
  revisionB,
} from "../../support/workspaceRepositoryFixtures";

describe("workspace repository local cache", () => {
  it("stores only v4 content with separate draft and remote revisions", async () => {
    const cache = createMemoryWorkspaceRepositoryCache();
    const created = await cache.create({
      identity: "repository",
      localRevision: draftA,
      snapshot: {
        content: createWorkspaceRepositoryContent("Initial"),
        revision: revisionA,
      },
    });

    expect(created).toEqual({
      content: createWorkspaceRepositoryContent("Initial"),
      localRevision: draftA,
      pendingBaseRevision: null,
      remoteRevision: revisionA,
    });
    expect(created.localRevision).toMatch(/^draft:/);
    expect(created.remoteRevision).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("performs local revision CAS and retains the first remote base", async () => {
    const cache = createMemoryWorkspaceRepositoryCache();
    await cache.create({
      identity: "repository",
      localRevision: draftA,
      snapshot: {
        content: createWorkspaceRepositoryContent("Initial"),
        revision: revisionA,
      },
    });

    await cache.stage({
      content: createWorkspaceRepositoryContent("Winner"),
      expectedLocalRevision: draftA,
      identity: "repository",
      localRevision: draftB,
    });
    await expect(
      cache.stage({
        content: createWorkspaceRepositoryContent("Stale tab"),
        expectedLocalRevision: draftA,
        identity: "repository",
        localRevision: draftA,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WorkspaceRepositoryLocalConflictError>>({
        currentRevision: draftB,
      }),
    );

    await expect(cache.load("repository")).resolves.toMatchObject({
      content: { workspace: { name: "Winner" } },
      localRevision: draftB,
      pendingBaseRevision: revisionA,
      remoteRevision: revisionA,
    });
  });

  it("does not clear a newer pending stage when an older sync completes", async () => {
    const cache = createMemoryWorkspaceRepositoryCache();
    await cache.create({
      identity: "repository",
      localRevision: draftA,
      snapshot: {
        content: createWorkspaceRepositoryContent("Initial"),
        revision: revisionA,
      },
    });
    await cache.stage({
      content: createWorkspaceRepositoryContent("Being synchronized"),
      expectedLocalRevision: draftA,
      identity: "repository",
      localRevision: draftB,
    });
    await cache.stage({
      content: createWorkspaceRepositoryContent("Newest"),
      expectedLocalRevision: draftB,
      identity: "repository",
      localRevision: draftC,
    });

    const completed = await cache.completeSync({
      committedRemoteRevision: revisionB,
      expectedLocalRevision: draftB,
      identity: "repository",
    });

    expect(completed).toMatchObject({
      content: { workspace: { name: "Newest" } },
      localRevision: draftC,
      pendingBaseRevision: revisionB,
      remoteRevision: revisionB,
    });
  });

  it("isolates stored values from caller mutation", async () => {
    const cache = createMemoryWorkspaceRepositoryCache();
    const content = createWorkspaceRepositoryContent("Immutable");

    const created = await cache.create({
      identity: "repository",
      localRevision: draftA,
      snapshot: { content, revision: revisionA },
    });
    content.workspace.name = "Mutated input";
    created.content.workspace.name = "Mutated output";

    await expect(cache.load("repository")).resolves.toMatchObject({
      content: { workspace: { name: "Immutable" } },
    });
  });

  it("rejects invalid exact content at the cache write boundary", async () => {
    const cache = createMemoryWorkspaceRepositoryCache();
    const invalidInitial = createWorkspaceRepositoryContent("Invalid");

    Object.assign(invalidInitial.workspace.notes[0]!, {
      title: "derived field must not persist",
    });
    await expect(cache.create({
      identity: "repository",
      localRevision: draftA,
      snapshot: { content: invalidInitial, revision: revisionA },
    })).rejects.toThrow("unsupported field");
    await expect(cache.load("repository")).resolves.toBeNull();

    await cache.create({
      identity: "repository",
      localRevision: draftA,
      snapshot: {
        content: createWorkspaceRepositoryContent("Valid"),
        revision: revisionA,
      },
    });
    const invalidStage = createWorkspaceRepositoryContent("Invalid stage");

    invalidStage.workspace.notes = [{ id: "../escape", source: "unsafe" }];
    invalidStage.workspace.tree = [{ kind: "note", noteId: "../escape" }];
    await expect(cache.stage({
      content: invalidStage,
      expectedLocalRevision: draftA,
      identity: "repository",
      localRevision: draftB,
    })).rejects.toThrow("invalid repository note id");
    await expect(cache.load("repository")).resolves.toMatchObject({
      content: { workspace: { name: "Valid" } },
      localRevision: draftA,
    });
  });
});
