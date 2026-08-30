import { describe, expect, it } from "vitest";
import { WorkspaceRepositoryLocalConflictError } from "../../../../application/workspace/persistence/workspaceRepository";
import { createMemoryWorkspaceRepositoryCache } from "../../../../infrastructure/client/repository/workspaceRepositoryCache";
import {
  createWorkspaceRepositoryContent,
  draftA,
  draftB,
  draftC,
  revisionA,
  revisionB,
} from "../../../support/workspaceRepositoryFixtures";

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
      conflictUnitIds: null,
      content: createWorkspaceRepositoryContent("Winner"),
      expectedLocalRevision: draftA,
      identity: "repository",
      localRevision: draftB,
    });
    await expect(
      cache.stage({
        conflictUnitIds: null,
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
    const committedContent =
      createWorkspaceRepositoryContent("Being synchronized");
    await cache.create({
      identity: "repository",
      localRevision: draftA,
      snapshot: {
        content: createWorkspaceRepositoryContent("Initial"),
        revision: revisionA,
      },
    });
    await cache.stage({
      conflictUnitIds: null,
      content: committedContent,
      expectedLocalRevision: draftA,
      identity: "repository",
      localRevision: draftB,
    });
    await cache.stage({
      conflictUnitIds: null,
      content: createWorkspaceRepositoryContent("Newest"),
      expectedLocalRevision: draftB,
      identity: "repository",
      localRevision: draftC,
    });

    await expect(cache.rebaseFromRemote({
      content: committedContent,
      expectedLocalRevision: draftB,
      identity: "repository",
      localRevision: draftB,
      pendingChanges: false,
      snapshot: { content: committedContent, revision: revisionB },
    })).rejects.toMatchObject({ currentRevision: draftC });

    await expect(cache.load("repository")).resolves.toMatchObject({
      content: { workspace: { name: "Newest" } },
      localRevision: draftC,
      pendingBaseRevision: revisionA,
      remoteRevision: revisionA,
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

  it("clones already-typed content without repeating wire or domain parsing", async () => {
    const cache = createMemoryWorkspaceRepositoryCache();
    const typedContent = createWorkspaceRepositoryContent("Typed handoff");

    Object.assign(typedContent.workspace.notes[0]!, {
      internalMarker: "cache must not reinterpret typed content",
    });
    await cache.create({
      identity: "repository",
      localRevision: draftA,
      snapshot: { content: typedContent, revision: revisionA },
    });
    const staged = createWorkspaceRepositoryContent("Typed stage");

    await cache.stage({
      conflictUnitIds: null,
      content: staged,
      expectedLocalRevision: draftA,
      identity: "repository",
      localRevision: draftB,
    });
    typedContent.workspace.name = "mutated after handoff";
    staged.workspace.name = "mutated after stage";
    await expect(cache.load("repository")).resolves.toMatchObject({
      content: { workspace: { name: "Typed stage" } },
      localRevision: draftB,
    });
  });
});
