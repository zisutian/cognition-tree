import { describe, expect, it } from "vitest";
import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../../contracts/workspace-repository/contractValue";
import type { WorkspaceRepositoryContentDto } from "../../../../contracts/workspace-repository/types";
import { WorkspaceRevisionConflictError } from "../../../../server/repository/repositoryStore.ts";
import {
  RepositoryCorruptError,
} from "../../../../server/repository/repositoryStore.ts";
import { WebDavRequestError } from "../../../../server/adapters/webdav/webDavTransport.ts";
import {
  WebDavRepositoryBusyError,
  WebDavWorkspaceStore,
  webDavCommitPhases,
  webDavCurrentPath,
  webDavLockPath,
} from "../../../../server/adapters/webdav/webDavWorkspaceStore.ts";
import {
  createDeepRepositoryContent,
  inspectDeepRepositoryContent,
} from "../../../storage/repositoryV3Fixtures";
import { InMemoryWebDavTransport } from "./inMemoryWebDavTransport";

function createContent(name: string, noteCount = 1): WorkspaceRepositoryContentDto {
  const notes = Array.from({ length: noteCount }, (_, index) => ({
    id: `note-${index}`,
    source: `${name} ${index}\n\t- 内容`,
  }));

  return {
    schemaVersion: 3,
    syntaxSource: 'name = "test"\n',
    workspace: {
      id: "workspace-webdav",
      name,
      notes,
      tree: notes.map((note) => ({ kind: "note" as const, noteId: note.id })),
    },
  };
}

function idSequence(prefix: string) {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function createStore(
  transport: InMemoryWebDavTransport,
  options: Partial<ConstructorParameters<typeof WebDavWorkspaceStore>[0]> = {},
) {
  return new WebDavWorkspaceStore({
    createId: idSequence("id"),
    transport,
    ...options,
  });
}

describe("WebDAV generation store v3", () => {
  it("commits, validates, and loads a 10,000-level immutable generation", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport);
    const base = await store.loadSnapshot();
    const content = createDeepRepositoryContent(10_000, "Deep WebDAV");
    const committed = await store.commitSnapshot({
      baseRevision: base.revision,
      content,
    });
    const loaded = await store.loadSnapshot();

    expect(loaded.revision).toBe(committed.revision);
    expect(loaded.content.workspace.name).toBe("Deep WebDAV");
    expect(loaded.content.workspace.notes).toEqual(content.workspace.notes);
    expect(inspectDeepRepositoryContent(loaded.content)).toEqual({
      deepestFolder: {
        folderId: "folder-10000",
        title: 'Level 10000 · "深层"',
      },
      depth: 10_000,
      leaf: { kind: "note", noteId: "deep-note" },
      rootFolder: { folderId: "folder-1", title: 'Level 1 · "深层"' },
    });
  }, 10_000);

  it("initializes an empty target and publishes immutable generations by pointer CAS", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport);
    const empty = await store.loadSnapshot();
    const content = createContent("远端仓库");
    const result = await store.commitSnapshot({ baseRevision: empty.revision, content });

    await expect(store.loadSnapshot()).resolves.toEqual({ content, revision: result.revision });
    const pointer = JSON.parse(transport.source(webDavCurrentPath) ?? "null");

    expect(pointer).toMatchObject({ revision: result.revision, schemaVersion: 3 });
    expect(transport.has(`.ctn-generations/${pointer.generation}/workspace.json`)).toBe(true);
    expect(transport.has(`.ctn-generations/${pointer.generation}/notes/note-0.ctn`)).toBe(true);
    expect(transport.has(`.ctn-generations/${pointer.generation}/syntax/workspace.toml`)).toBe(true);
    expect(transport.has(webDavLockPath)).toBe(false);
  });

  it("uses the stable registration identity as the empty target workspace default", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport, {
      initialWorkspaceId: "remote-notes",
      initialWorkspaceName: "远端笔记",
    });

    await expect(store.loadSnapshot()).resolves.toMatchObject({
      content: {
        workspace: {
          id: "remote-notes",
          name: "远端笔记",
        },
      },
    });
  });

  it("fences concurrent empty-target initialization and then loads the published generation", async () => {
    const transport = new InMemoryWebDavTransport();
    let releaseUpload!: () => void;
    let uploadStarted!: () => void;
    const started = new Promise<void>((resolve) => { uploadStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseUpload = resolve; });
    const first = createStore(transport, { createId: idSequence("initializer-a") });
    const second = createStore(transport, { createId: idSequence("initializer-b") });

    transport.beforeWrite = async (relativePath) => {
      if (relativePath.includes("/workspace.json")) {
        uploadStarted();
        await release;
      }
    };
    const firstLoad = first.loadSnapshot();

    await started;
    await expect(second.loadSnapshot()).rejects.toBeInstanceOf(WebDavRepositoryBusyError);
    releaseUpload();
    const published = await firstLoad;

    transport.beforeWrite = null;
    await expect(second.loadSnapshot()).resolves.toEqual(published);
  });

  it("rejects stale revisions without mutating the published pointer", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport);
    const empty = await store.loadSnapshot();
    const first = await store.commitSnapshot({
      baseRevision: empty.revision,
      content: createContent("first"),
    });
    const pointer = transport.source(webDavCurrentPath);

    await expect(store.commitSnapshot({
      baseRevision: empty.revision,
      content: createContent("stale"),
    })).rejects.toMatchObject({ currentRevision: first.revision });
    expect(transport.source(webDavCurrentPath)).toBe(pointer);
    expect(transport.has(webDavLockPath)).toBe(false);
  });

  it("fences concurrent writers with a renewable lease", async () => {
    const transport = new InMemoryWebDavTransport();
    let releaseUpload!: () => void;
    let uploaded!: () => void;
    const uploadReached = new Promise<void>((resolve) => { uploaded = resolve; });
    const uploadRelease = new Promise<void>((resolve) => { releaseUpload = resolve; });
    const first = createStore(transport, {
      createId: idSequence("first"),
      async onCommitPhase(phase) {
        if (phase === webDavCommitPhases.generationUploaded) {
          uploaded();
          await uploadRelease;
        }
      },
    });
    const base = await first.loadSnapshot();
    const second = createStore(transport, { createId: idSequence("second") });

    await second.initialize();
    const firstCommit = first.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("first"),
    });
    await uploadReached;
    await expect(second.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("second"),
    })).rejects.toBeInstanceOf(WebDavRepositoryBusyError);
    releaseUpload();
    await expect(firstCommit).resolves.toHaveProperty("revision");
  });

  it("renews the writer lease throughout a commit longer than one lease period", async () => {
    const transport = new InMemoryWebDavTransport();
    let uploaded!: () => void;
    const uploadReached = new Promise<void>((resolve) => { uploaded = resolve; });
    const first = createStore(transport, {
      createId: idSequence("long-first"),
      lockLeaseMs: 40,
      lockRenewMs: 10,
      async onCommitPhase(phase) {
        if (phase === webDavCommitPhases.generationUploaded) {
          uploaded();
          await new Promise((resolve) => setTimeout(resolve, 70));
        }
      },
    });
    const base = await first.loadSnapshot();
    const second = createStore(transport, {
      createId: idSequence("long-second"),
      lockLeaseMs: 40,
      lockRenewMs: 10,
    });

    await second.initialize();
    const commit = first.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("long commit"),
    });
    await uploadReached;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(second.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("must be fenced"),
    })).rejects.toBeInstanceOf(WebDavRepositoryBusyError);
    await expect(commit).resolves.toHaveProperty("revision");
  });

  it("uses pointer ETag CAS as final fencing", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport, {
      async onCommitPhase(phase) {
        if (phase === webDavCommitPhases.generationValidated) {
          const resource = await transport.readText(webDavCurrentPath);

          if (!resource?.etag) {
            throw new Error("missing pointer");
          }
          await transport.writeText(webDavCurrentPath, resource.source, {
            ifMatch: resource.etag,
          });
        }
      },
    });
    const base = await store.loadSnapshot();

    await expect(store.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("fenced"),
    })).rejects.toBeInstanceOf(WorkspaceRevisionConflictError);
    await expect(store.loadSnapshot()).resolves.toEqual(base);
  });

  it("retries once when a commit publishes while a generation is being loaded", async () => {
    const transport = new InMemoryWebDavTransport();
    const writer = createStore(transport, { createId: idSequence("interleave-writer") });
    const base = await writer.loadSnapshot();
    const initial = await writer.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("before"),
    });
    const reader = createStore(transport, { createId: idSequence("interleave-reader") });

    await reader.initialize();
    const pointer = JSON.parse(transport.source(webDavCurrentPath) ?? "null") as {
      generation: string;
    };
    const nextContent = createContent("after");
    let publishedRevision: string | null = null;

    transport.beforeRead = async (relativePath) => {
      if (relativePath !== `.ctn-generations/${pointer.generation}/workspace.json`) {
        return;
      }
      transport.beforeRead = null;
      const published = await writer.commitSnapshot({
        baseRevision: initial.revision,
        content: nextContent,
      });

      publishedRevision = published.revision;
    };

    const loaded = await reader.loadSnapshot();

    expect(loaded).toEqual({
      content: nextContent,
      revision: publishedRevision,
    });
  });

  it("never publishes after lease renewal is lost", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport, {
      onCommitPhase(phase) {
        if (phase === webDavCommitPhases.generationValidated) {
          transport.beforeWrite = (path) => {
            if (path === webDavLockPath) {
              throw new WebDavRequestError("PUT", path, 412);
            }
          };
        }
      },
    });
    const base = await store.loadSnapshot();
    const pointer = transport.source(webDavCurrentPath);

    await expect(store.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("lost lease"),
    })).rejects.toBeInstanceOf(WebDavRepositoryBusyError);
    transport.beforeWrite = null;
    expect(transport.source(webDavCurrentPath)).toBe(pointer);
  });

  it("stops scheduling generation uploads as soon as lease renewal is lost", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport, {
      lockLeaseMs: 100,
      lockRenewMs: 5,
    });
    const base = await store.loadSnapshot();
    const pointer = transport.source(webDavCurrentPath);

    expect(transport.has(webDavLockPath)).toBe(false);
    let activeGenerationWrites = 0;
    let generationWriteAttempts = 0;
    let lockWriteAttempts = 0;
    let releaseUploads!: () => void;
    let firstBatchStarted!: () => void;
    const uploadsReleased = new Promise<void>((resolve) => {
      releaseUploads = resolve;
    });
    const firstBatch = new Promise<void>((resolve) => {
      firstBatchStarted = resolve;
    });

    transport.beforeWrite = async (path) => {
      if (path === webDavLockPath) {
        lockWriteAttempts += 1;
        if (lockWriteAttempts > 1) {
          throw new WebDavRequestError("PUT", path, 412);
        }
        return;
      }
      if (!path.startsWith(".ctn-generations/")) {
        return;
      }

      generationWriteAttempts += 1;
      activeGenerationWrites += 1;
      if (activeGenerationWrites === 8) {
        firstBatchStarted();
      }
      await uploadsReleased;
      activeGenerationWrites -= 1;
    };
    const commit = store.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("lost during upload", 24),
    });

    await firstBatch;
    await new Promise((resolve) => setTimeout(resolve, 15));
    releaseUploads();

    await expect(commit).rejects.toBeInstanceOf(WebDavRepositoryBusyError);
    expect(generationWriteAttempts).toBe(8);
    expect(transport.source(webDavCurrentPath)).toBe(pointer);
  });

  it("classifies invalid persisted layout as corruption but invalid inbound content as a request error", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport);
    const base = await store.loadSnapshot();
    const invalidContent: WorkspaceRepositoryContentDto = {
      schemaVersion: 3,
      syntaxSource: null,
      workspace: {
        id: "workspace-webdav",
        name: "invalid inbound",
        notes: [{ id: "../escape", source: "invalid" }],
        tree: [{ kind: "note", noteId: "../escape" }],
      },
    };

    await expect(store.commitSnapshot({
      baseRevision: base.revision,
      content: invalidContent,
    })).rejects.toBeInstanceOf(WorkspaceRepositoryContractError);

    const pointer = JSON.parse(transport.source(webDavCurrentPath) ?? "null") as {
      generation: string;
    };

    await transport.writeText(
      `.ctn-generations/${pointer.generation}/workspace.json`,
      JSON.stringify({
        id: "workspace-webdav",
        name: "tampered",
        tree: [{ kind: "note", noteId: "../escape" }],
      }),
    );
    await expect(store.loadSnapshot()).rejects.toBeInstanceOf(RepositoryCorruptError);
  });

  it("classifies an invalid persisted pointer revision as corruption", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport);

    await store.loadSnapshot();
    const pointer = JSON.parse(transport.source(webDavCurrentPath) ?? "null") as Record<
      string,
      unknown
    >;

    await transport.writeText(webDavCurrentPath, JSON.stringify({
      ...pointer,
      revision: "not-a-revision",
    }));
    await expect(store.loadSnapshot()).rejects.toBeInstanceOf(RepositoryCorruptError);
  });

  it("recovers an expired lease with conditional deletion", async () => {
    const transport = new InMemoryWebDavTransport();
    const now = Date.parse("2026-07-15T12:00:00.000Z");
    const store = createStore(transport, { now: () => now });
    const base = await store.loadSnapshot();

    await transport.writeText(webDavLockPath, JSON.stringify({
      expiresAt: new Date(now - 1).toISOString(),
      schemaVersion: 3,
      token: "expired",
    }), { ifNoneMatch: "*" });
    await expect(store.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("recovered"),
    })).resolves.toHaveProperty("revision");
    expect(transport.has(webDavLockPath)).toBe(false);
  });

  it("uploads note files with at most eight concurrent requests", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport);
    const base = await store.loadSnapshot();

    transport.maxActiveWrites = 0;
    transport.beforeWrite = async (path) => {
      if (path.includes("/.ctn-generations/") || path.startsWith(".ctn-generations/")) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    };
    await store.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("capacity", 24),
    });
    expect(transport.maxActiveWrites).toBeGreaterThan(1);
    expect(transport.maxActiveWrites).toBeLessThanOrEqual(8);
  });

  it("garbage-collects only old non-current generations while holding the lease", async () => {
    const transport = new InMemoryWebDavTransport();
    const now = Date.parse("2026-07-15T12:00:00.000Z");
    const store = createStore(transport, { now: () => now });
    const base = await store.loadSnapshot();
    const initialPointer = JSON.parse(transport.source(webDavCurrentPath) ?? "null") as {
      generation: string;
    };
    const oldGenerationPath = `.ctn-generations/${initialPointer.generation}`;

    transport.setModified(oldGenerationPath, now - 25 * 60 * 60 * 1_000);
    await transport.createCollection(".ctn-generations/recent-orphan");
    transport.setModified(".ctn-generations/recent-orphan", now - 60_000);
    await store.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("gc"),
    });
    const currentPointer = JSON.parse(transport.source(webDavCurrentPath) ?? "null") as {
      generation: string;
    };

    expect(transport.has(oldGenerationPath)).toBe(false);
    expect(transport.has(".ctn-generations/recent-orphan")).toBe(true);
    expect(transport.has(`.ctn-generations/${currentPointer.generation}`)).toBe(true);
  });

  it("stops orphan deletion when the GC lease is lost", async () => {
    const transport = new InMemoryWebDavTransport();
    const now = Date.parse("2026-07-15T12:00:00.000Z");
    const store = createStore(transport, { now: () => now });
    const base = await store.loadSnapshot();
    const pointer = JSON.parse(transport.source(webDavCurrentPath) ?? "null") as {
      generation: string;
    };
    const oldGenerationPath = `.ctn-generations/${pointer.generation}`;

    transport.setModified(oldGenerationPath, now - 25 * 60 * 60 * 1_000);
    transport.beforeList = async (relativePath) => {
      if (relativePath !== ".ctn-generations") {
        return;
      }
      transport.beforeList = null;
      await transport.remove(webDavLockPath);
      await transport.writeText(webDavLockPath, JSON.stringify({
        expiresAt: new Date(now + 60_000).toISOString(),
        schemaVersion: 3,
        token: "takeover",
      }), { ifNoneMatch: "*" });
    };

    await expect(store.commitSnapshot({
      baseRevision: base.revision,
      content: createContent("published before GC"),
    })).resolves.toHaveProperty("revision");
    expect(transport.has(oldGenerationPath)).toBe(true);
  });

  it("does not report failure when post-CAS garbage collection fails", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport);
    const base = await store.loadSnapshot();
    const content = createContent("published");

    transport.beforeList = () => {
      throw new WebDavRequestError("PROPFIND", ".ctn-generations", 503);
    };
    const committed = await store.commitSnapshot({
      baseRevision: base.revision,
      content,
    });

    transport.beforeList = null;
    await expect(store.loadSnapshot()).resolves.toEqual({
      content,
      revision: committed.revision,
    });
  });

  it("rejects a legacy direct-file target", async () => {
    const transport = new InMemoryWebDavTransport();

    await transport.writeText("workspace.json", "{}", { ifNoneMatch: "*" });
    await expect(createStore(transport).loadSnapshot())
      .rejects.toBeInstanceOf(UnsupportedRepositoryVersionError);
  });

  it("refuses to initialize a non-empty unmanaged WebDAV target", async () => {
    const transport = new InMemoryWebDavTransport();

    await transport.writeText("unrelated.txt", "do not overwrite", { ifNoneMatch: "*" });
    await expect(createStore(transport).loadSnapshot())
      .rejects.toBeInstanceOf(RepositoryCorruptError);
    expect(transport.source("unrelated.txt")).toBe("do not overwrite");
    expect(transport.has(webDavCurrentPath)).toBe(false);
  });
});
