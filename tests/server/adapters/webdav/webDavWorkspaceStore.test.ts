import { describe, expect, it } from "vitest";
import { createWorkspaceRepositorySyntaxSourceFile } from "../../../../src/storage/repository/workspaceRepository";
import { WorkspaceRevisionConflictError } from "../../../../server/repository/repositoryStore.ts";
import {
  WebDavRepositoryBusyError,
  WebDavWorkspaceStore,
  webDavCommitPhases,
} from "../../../../server/adapters/webdav/webDavWorkspaceStore.ts";
import { InMemoryWebDavTransport } from "./inMemoryWebDavTransport";

const timestamp = "2026-07-15T00:00:00.000Z";

function createContent(name: string) {
  const source = `${name}\n\t- 内容`;

  return {
    syntaxSourceFile: createWorkspaceRepositorySyntaxSourceFile(
      'name = "test"\n',
    ),
    workspace: {
      id: "workspace-webdav",
      name,
      notes: [
        {
          createdAt: timestamp,
          id: "note-main",
          source,
          title: name,
          updatedAt: timestamp,
        },
      ],
      tree: [{ id: "tree-main", kind: "note" as const, noteId: "note-main" }],
    },
  };
}

function createStore(
  transport: InMemoryWebDavTransport,
  options: Partial<ConstructorParameters<typeof WebDavWorkspaceStore>[0]> = {},
) {
  return new WebDavWorkspaceStore({
    createId: () => "transaction-1",
    repositoryPath: "https://dav.example.test/knowledge/",
    transport,
    ...options,
  });
}

describe("WebDAV workspace store", () => {
  it("commits direct repository files and removes transaction artifacts", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport);
    const empty = await store.loadSnapshot();
    const content = createContent("远端仓库");
    const result = await store.commitSnapshot({
      ...content,
      baseRevision: empty.revision,
    });

    await expect(store.loadSnapshot()).resolves.toMatchObject({
      ...content,
      repositoryPath: "https://dav.example.test/knowledge/",
      revision: result.revision,
    });
    expect(transport.has("workspace.json")).toBe(true);
    expect(transport.has("notes/note-main.ctn")).toBe(true);
    expect(transport.has("syntax/workspace.toml")).toBe(true);
    expect(transport.listPaths().filter((path) => path.startsWith(".ctn-")))
      .toEqual([]);
  });

  it("rejects stale revisions without leaving a lock", async () => {
    const transport = new InMemoryWebDavTransport();
    const store = createStore(transport);
    const empty = await store.loadSnapshot();

    await store.commitSnapshot({
      ...createContent("第一版"),
      baseRevision: empty.revision,
    });
    await expect(
      store.commitSnapshot({
        ...createContent("过期版本"),
        baseRevision: empty.revision,
      }),
    ).rejects.toBeInstanceOf(WorkspaceRevisionConflictError);
    expect(transport.has(".ctn-lock.json")).toBe(false);
  });

  it("recovers a journal after interruption before manifest replacement", async () => {
    const transport = new InMemoryWebDavTransport();
    let shouldInterrupt = true;
    const store = createStore(transport, {
      onCommitPhase(phase) {
        if (phase === webDavCommitPhases.filesApplied && shouldInterrupt) {
          shouldInterrupt = false;
          throw new Error("simulated interruption");
        }
      },
    });
    const empty = await store.loadSnapshot();
    const content = createContent("恢复版本");

    await expect(
      store.commitSnapshot({ ...content, baseRevision: empty.revision }),
    ).rejects.toThrow("simulated interruption");
    expect(transport.has(".ctn-journal.json")).toBe(true);
    expect(transport.has(".ctn-lock.json")).toBe(true);

    await expect(store.loadSnapshot()).resolves.toMatchObject(content);
    expect(transport.listPaths().filter((path) => path.startsWith(".ctn-")))
      .toEqual([]);
  });

  it("rejects a fresh external lock and removes an expired orphan lock", async () => {
    const transport = new InMemoryWebDavTransport();
    const now = Date.parse("2026-07-15T12:00:00.000Z");
    const lock = {
      acquiredAt: new Date(now).toISOString(),
      stagingDir: ".ctn-stage-external",
      token: "external",
      version: 1,
    };

    await transport.createCollection(lock.stagingDir);
    await transport.writeText(
      ".ctn-lock.json",
      `${JSON.stringify(lock)}\n`,
    );
    const store = createStore(transport, { now: () => now });

    await expect(store.loadSnapshot()).rejects.toBeInstanceOf(
      WebDavRepositoryBusyError,
    );
    const recoveredStore = createStore(transport, {
      now: () => now + 60_000,
    });

    await expect(recoveredStore.loadSnapshot()).resolves.toMatchObject({
      workspace: { notes: [] },
    });
    expect(transport.has(".ctn-lock.json")).toBe(false);
    expect(transport.has(lock.stagingDir)).toBe(false);
  });
});
