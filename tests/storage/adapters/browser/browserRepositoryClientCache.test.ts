import {
  IDBDatabase as FakeIDBDatabase,
  IDBFactory,
  IDBObjectStore,
  IDBTransaction,
} from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RepositoryDescriptorDto,
  WorkspaceRepositoryContentDto,
} from "../../../../contracts/workspace-repository/types";
import { createIndexedDbRepositoryClientCache } from "../../../../infrastructure/browser/browserRepositoryClientCache";
import { WorkspaceRepositoryLocalConflictError } from "../../../../application/repository/workspaceRepository";
import { UnsupportedRepositoryVersionError } from "../../../../contracts/workspace-repository/contractValue";
import {
  draftA,
  draftB,
  draftC,
  revisionA,
  revisionB,
} from "../../repositoryV3Fixtures";

const databaseName = "cognition-tree.repository-cache";
const catalogStoreName = "repository-catalogs-v4";
const stateStoreName = "repository-states-v4";
const noteStoreName = "repository-notes-v4";
const repositoryIdentity = "browser:primary";
const catalogIdentity = "browser";

const descriptor: RepositoryDescriptorDto = {
  adapter: "browser",
  id: "primary",
  label: "Primary",
  location: {
    databaseName,
    type: "browser",
  },
  labelIssue: null,
};

function requestResult<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

async function openDatabase(
  indexedDb: IDBFactory,
  version?: number,
  upgrade?: (database: IDBDatabase) => void,
) {
  const request = version === undefined
    ? indexedDb.open(databaseName)
    : indexedDb.open(databaseName, version);

  if (upgrade) {
    request.addEventListener("upgradeneeded", () => upgrade(request.result));
  }

  return requestResult(request);
}

function createContent(
  notes: Array<{ id: string; source: string }> = [
    { id: "note-a", source: "@ctn-block title title-a\nA" },
  ],
): WorkspaceRepositoryContentDto {
  return {
    schemaVersion: 4,
    syntax: { activeFileId: null, files: [] },
    workspace: {
      id: "workspace",
      name: "Workspace",
      notes,
      tree: notes.map(({ id }) => ({ kind: "note" as const, noteId: id })),
    },
  };
}

async function createRepository(
  indexedDb: IDBFactory,
  content = createContent(),
) {
  const cache = createIndexedDbRepositoryClientCache(indexedDb);

  await cache.createRepositoryAtomically({
    catalogIdentity,
    content,
    descriptor,
    localRevision: draftA,
    remoteRevision: revisionA,
    repositoryIdentity,
  });

  return cache;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IndexedDB repository client cache", () => {
  it("drops every v3 object store during the v4 upgrade without reading old content", async () => {
    const indexedDb = new IDBFactory();
    const legacyDatabase = await openDatabase(indexedDb, 3, (database) => {
      database.createObjectStore("repository-catalogs-v3");
      database.createObjectStore("repository-states-v3");
      database.createObjectStore("repository-notes-v3");
      database.createObjectStore("unrelated-legacy-store");
    });
    const legacyTransaction = legacyDatabase.transaction(
      [
        "repository-catalogs-v3",
        "repository-states-v3",
        "repository-notes-v3",
        "unrelated-legacy-store",
      ],
      "readwrite",
    );
    const legacyCompletion = transactionComplete(legacyTransaction);

    legacyTransaction.objectStore("repository-catalogs-v3").put(
      {
        creatableAdapters: ["browser"],
        issues: [],
        repositories: [{
          adapter: "browser",
          id: descriptor.id,
          label: descriptor.label,
          locationLabel: "legacy browser label",
        }],
        version: 3,
      },
      catalogIdentity,
    );
    legacyTransaction.objectStore("repository-states-v3").put(
      { identity: repositoryIdentity, workspace: { id: "legacy" } },
      repositoryIdentity,
    );
    legacyTransaction.objectStore("repository-notes-v3").put("legacy", "key");
    legacyTransaction.objectStore("unrelated-legacy-store").put("legacy", "key");
    await legacyCompletion;
    legacyDatabase.close();

    const cache = createIndexedDbRepositoryClientCache(indexedDb);

    await expect(cache.catalogs.load(catalogIdentity)).resolves.toBeNull();
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toBeNull();

    const upgradedDatabase = await openDatabase(indexedDb);

    expect([...upgradedDatabase.objectStoreNames]).toEqual([
      catalogStoreName,
      noteStoreName,
      stateStoreName,
    ]);
    upgradedDatabase.close();
  });

  it("creates descriptor, repository state, and note sources in one transaction", async () => {
    const indexedDb = new IDBFactory();
    const content = createContent([
      { id: "note-a", source: "@ctn-block title title-a\nA" },
      { id: "note-b", source: "@ctn-block title title-b\nB" },
    ]);
    const cache = await createRepository(indexedDb, content);

    await expect(cache.catalogs.load(catalogIdentity)).resolves.toEqual({
      creatableAdapters: ["browser"],
      issues: [],
      repositories: [descriptor],
      version: 4,
    });
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toEqual({
      content,
      localRevision: draftA,
      pendingBaseRevision: null,
      remoteRevision: revisionA,
    });

    const database = await openDatabase(indexedDb);
    const transaction = database.transaction(
      [catalogStoreName, stateStoreName, noteStoreName],
      "readonly",
    );
    const completion = transactionComplete(transaction);
    const catalog = await requestResult(
      transaction.objectStore(catalogStoreName).get(catalogIdentity),
    );
    const state = await requestResult(
      transaction.objectStore(stateStoreName).get(repositoryIdentity),
    );
    const notes = await requestResult(
      transaction.objectStore(noteStoreName).getAll(),
    );

    await completion;
    expect(catalog).toMatchObject({ repositories: [descriptor], version: 4 });
    expect(state).toMatchObject({
      identity: repositoryIdentity,
      localRevision: draftA,
      noteIds: ["note-a", "note-b"],
      schemaVersion: 4,
      syntax: { activeFileId: null, files: [] },
    });
    expect(notes).toEqual([
      { id: "note-a", identity: repositoryIdentity, source: content.workspace.notes[0]?.source },
      { id: "note-b", identity: repositoryIdentity, source: content.workspace.notes[1]?.source },
    ]);
    database.close();
  });

  it("reports an existing v3 repository state as unsupported without rewriting it", async () => {
    const indexedDb = new IDBFactory();
    const cache = createIndexedDbRepositoryClientCache(indexedDb);

    await expect(cache.snapshots.load("missing")).resolves.toBeNull();
    const database = await openDatabase(indexedDb);
    const legacyState = {
      identity: repositoryIdentity,
      localRevision: draftA,
      noteIds: [],
      pendingBaseRevision: null,
      remoteRevision: revisionA,
      schemaVersion: 3,
      syntaxSource: null,
      workspace: { id: "legacy", name: "Legacy", tree: [] },
    };
    const write = database.transaction(stateStoreName, "readwrite");
    const writeCompletion = transactionComplete(write);

    write.objectStore(stateStoreName).put(legacyState);
    await writeCompletion;
    await expect(cache.snapshots.load(repositoryIdentity)).rejects.toBeInstanceOf(
      UnsupportedRepositoryVersionError,
    );

    const read = database.transaction(stateStoreName, "readonly");
    const readCompletion = transactionComplete(read);
    const retained = await requestResult(
      read.objectStore(stateStoreName).get(repositoryIdentity),
    );

    await readCompletion;
    expect(retained).toEqual(legacyState);
    database.close();
  });

  it("rejects invalid outbound content without mutating normalized stores", async () => {
    const indexedDb = new IDBFactory();
    const cache = createIndexedDbRepositoryClientCache(indexedDb);
    const invalidCreate = createContent();

    Object.assign(invalidCreate.workspace.notes[0]!, {
      title: "derived field must not persist",
    });
    await expect(cache.createRepositoryAtomically({
      catalogIdentity,
      content: invalidCreate,
      descriptor,
      localRevision: draftA,
      remoteRevision: revisionA,
      repositoryIdentity,
    })).rejects.toThrow("unsupported field");
    await expect(cache.catalogs.load(catalogIdentity)).resolves.toBeNull();
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toBeNull();

    await cache.createRepositoryAtomically({
      catalogIdentity,
      content: createContent(),
      descriptor,
      localRevision: draftA,
      remoteRevision: revisionA,
      repositoryIdentity,
    });
    const unsafeStage = createContent([
      { id: "../escape", source: "unsafe" },
    ]);

    await expect(cache.snapshots.stage({
      content: unsafeStage,
      expectedLocalRevision: draftA,
      identity: repositoryIdentity,
      localRevision: draftB,
    })).rejects.toThrow("invalid repository note id");
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toMatchObject({
      content: { workspace: { name: "Workspace" } },
      localRevision: draftA,
      pendingBaseRevision: null,
    });
  });

  it("rolls back catalog, state, and notes when the create transaction aborts", async () => {
    const indexedDb = new IDBFactory();
    const cache = createIndexedDbRepositoryClientCache(indexedDb);
    const transactionSpy = vi.spyOn(IDBTransaction.prototype, "abort");
    const originalTransaction = FakeIDBDatabase.prototype.transaction;

    vi.spyOn(FakeIDBDatabase.prototype, "transaction").mockImplementation(function (
      this: IDBDatabase,
      storeNames: string | Iterable<string>,
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions,
    ) {
      const transaction = originalTransaction.call(this, storeNames, mode, options);
      const names = typeof storeNames === "string" ? [storeNames] : [...storeNames];

      if (names.length === 3 && names.includes(catalogStoreName)) {
        queueMicrotask(() => transaction.abort());
      }

      return transaction;
    });

    await expect(
      cache.createRepositoryAtomically({
        catalogIdentity,
        content: createContent(),
        descriptor,
        localRevision: draftA,
        remoteRevision: revisionA,
        repositoryIdentity,
      }),
    ).rejects.toThrow();
    expect(transactionSpy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    await expect(cache.catalogs.load(catalogIdentity)).resolves.toBeNull();
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toBeNull();
  });

  it("deletes catalog metadata, state, and notes in one transaction", async () => {
    const indexedDb = new IDBFactory();
    const cache = await createRepository(indexedDb, createContent([
      { id: "note-a", source: "A" },
      { id: "note-b", source: "B" },
    ]));

    await cache.deleteRepositoryAtomically({
      catalogIdentity,
      repositoryId: descriptor.id,
      repositoryIdentity,
    });

    await expect(cache.catalogs.load(catalogIdentity)).resolves.toEqual({
      creatableAdapters: ["browser"],
      issues: [],
      repositories: [],
      version: 4,
    });
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toBeNull();

    const database = await openDatabase(indexedDb);
    const transaction = database.transaction(noteStoreName, "readonly");
    const completion = transactionComplete(transaction);
    const notes = await requestResult(
      transaction.objectStore(noteStoreName).getAll(),
    );

    await completion;
    expect(notes).toEqual([]);
    database.close();
  });

  it("atomically clears both sides of an existing label conflict on rename", async () => {
    const indexedDb = new IDBFactory();
    const cache = createIndexedDbRepositoryClientCache(indexedDb);

    await cache.catalogs.save(catalogIdentity, {
      creatableAdapters: ["browser"],
      issues: [],
      repositories: [
        { ...descriptor, id: "first", labelIssue: "conflict" },
        { ...descriptor, id: "second", labelIssue: "conflict" },
      ],
      version: 4,
    });
    await cache.renameRepositoryAtomically({
      catalogIdentity,
      label: "Renamed",
      repositoryId: "second",
    });

    await expect(cache.catalogs.load(catalogIdentity)).resolves.toMatchObject({
      repositories: [
        { id: "first", label: "Primary", labelIssue: null },
        { id: "second", label: "Renamed", labelIssue: null },
      ],
    });
  });

  it("rolls back all three stores when an atomic delete aborts", async () => {
    const indexedDb = new IDBFactory();
    const content = createContent([{ id: "note-a", source: "preserved" }]);
    const cache = await createRepository(indexedDb, content);
    const originalTransaction = FakeIDBDatabase.prototype.transaction;

    vi.spyOn(FakeIDBDatabase.prototype, "transaction").mockImplementation(function (
      this: IDBDatabase,
      storeNames: string | Iterable<string>,
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions,
    ) {
      const transaction = originalTransaction.call(this, storeNames, mode, options);
      const names = typeof storeNames === "string" ? [storeNames] : [...storeNames];

      if (names.length === 3 && names.includes(catalogStoreName)) {
        queueMicrotask(() => transaction.abort());
      }

      return transaction;
    });

    await expect(cache.deleteRepositoryAtomically({
      catalogIdentity,
      repositoryId: descriptor.id,
      repositoryIdentity,
    })).rejects.toThrow();

    vi.restoreAllMocks();
    await expect(cache.catalogs.load(catalogIdentity)).resolves.toMatchObject({
      repositories: [descriptor],
    });
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toMatchObject({
      content,
    });
  });

  it("serializes delete with a cross-tab stage so deleted state cannot reappear", async () => {
    const indexedDb = new IDBFactory();
    const firstCache = await createRepository(indexedDb);
    const secondCache = createIndexedDbRepositoryClientCache(indexedDb);
    const results = await Promise.allSettled([
      firstCache.snapshots.stage({
        content: createContent([{ id: "note-a", source: "changed" }]),
        expectedLocalRevision: draftA,
        identity: repositoryIdentity,
        localRevision: draftB,
      }),
      secondCache.deleteRepositoryAtomically({
        catalogIdentity,
        repositoryId: descriptor.id,
        repositoryIdentity,
      }),
    ]);

    expect(results[1]).toMatchObject({ status: "fulfilled" });
    await expect(firstCache.snapshots.load(repositoryIdentity)).resolves.toBeNull();
    await expect(firstCache.catalogs.load(catalogIdentity)).resolves.toMatchObject({
      repositories: [],
    });
    await expect(firstCache.snapshots.stage({
      content: createContent(),
      expectedLocalRevision: draftB,
      identity: repositoryIdentity,
      localRevision: draftC,
    })).rejects.toThrow("does not exist");
  });

  it("lets only one cache instance stage a shared local revision", async () => {
    const indexedDb = new IDBFactory();
    const firstCache = await createRepository(indexedDb);
    const secondCache = createIndexedDbRepositoryClientCache(indexedDb);
    const firstLoaded = await firstCache.snapshots.load(repositoryIdentity);
    const secondLoaded = await secondCache.snapshots.load(repositoryIdentity);

    expect(firstLoaded?.localRevision).toBe(draftA);
    expect(secondLoaded?.localRevision).toBe(draftA);

    const results = await Promise.allSettled([
      firstCache.snapshots.stage({
        content: createContent([
          { id: "note-a", source: "@ctn-block title title-a\nFirst" },
        ]),
        expectedLocalRevision: draftA,
        identity: repositoryIdentity,
        localRevision: draftB,
      }),
      secondCache.snapshots.stage({
        content: createContent([
          { id: "note-a", source: "@ctn-block title title-a\nSecond" },
        ]),
        expectedLocalRevision: draftA,
        identity: repositoryIdentity,
        localRevision: draftC,
      }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");

    expect(rejected).toMatchObject({
      reason: expect.any(WorkspaceRepositoryLocalConflictError),
      status: "rejected",
    });

    const stored = await firstCache.snapshots.load(repositoryIdentity);

    expect([draftB, draftC]).toContain(stored?.localRevision);
    expect(stored?.content.workspace.notes[0]?.source).toMatch(/First|Second/);
  });

  it("does not let a stale discard replace a newer cross-tab stage", async () => {
    const indexedDb = new IDBFactory();
    const firstCache = await createRepository(indexedDb);
    const secondCache = createIndexedDbRepositoryClientCache(indexedDb);
    const newestContent = createContent([
      { id: "note-a", source: "@ctn-block title title-a\nNewest tab content" },
    ]);

    await firstCache.snapshots.stage({
      content: newestContent,
      expectedLocalRevision: draftA,
      identity: repositoryIdentity,
      localRevision: draftB,
    });
    await expect(secondCache.snapshots.replaceFromRemote({
      expectedLocalRevision: draftA,
      identity: repositoryIdentity,
      localRevision: draftC,
      snapshot: {
        content: createContent([
          { id: "note-a", source: "@ctn-block title title-a\nRemote replacement" },
        ]),
        revision: revisionB,
      },
    })).rejects.toBeInstanceOf(WorkspaceRepositoryLocalConflictError);
    await expect(firstCache.snapshots.load(repositoryIdentity)).resolves.toMatchObject({
      content: newestContent,
      localRevision: draftB,
      pendingBaseRevision: revisionA,
    });
  });

  it("writes only changed and added notes while preserving and deleting the right records", async () => {
    const indexedDb = new IDBFactory();
    const initial = createContent([
      { id: "note-a", source: "@ctn-block title title-a\nA" },
      { id: "note-b", source: "@ctn-block title title-b\nB" },
      { id: "note-c", source: "@ctn-block title title-c\nC" },
    ]);
    const cache = await createRepository(indexedDb, initial);
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put");
    const deleteSpy = vi.spyOn(IDBObjectStore.prototype, "delete");
    const next = createContent([
      initial.workspace.notes[0]!,
      { id: "note-b", source: "@ctn-block title title-b\nB changed" },
      { id: "note-d", source: "@ctn-block title title-d\nD" },
    ]);

    await cache.snapshots.stage({
      content: next,
      expectedLocalRevision: draftA,
      identity: repositoryIdentity,
      localRevision: draftB,
    });

    const writtenNoteIds = putSpy.mock.calls
      .map(([value]) => value as { id?: string })
      .flatMap(({ id }) => id ? [id] : []);
    const deletedKeys = deleteSpy.mock.calls.map(([key]) => key);

    expect(writtenNoteIds).toEqual(["note-b", "note-d"]);
    expect(deletedKeys).toEqual([[repositoryIdentity, "note-c"]]);
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toEqual({
      content: next,
      localRevision: draftB,
      pendingBaseRevision: revisionA,
      remoteRevision: revisionA,
    });

    await cache.snapshots.completeSync({
      committedRemoteRevision: revisionB,
      expectedLocalRevision: draftB,
      identity: repositoryIdentity,
    });
    await expect(cache.snapshots.load(repositoryIdentity)).resolves.toMatchObject({
      content: next,
      pendingBaseRevision: null,
      remoteRevision: revisionB,
    });
  });
});
