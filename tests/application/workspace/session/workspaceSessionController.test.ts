import { describe, expect, it } from "vitest";
import {
  WorkspaceRepositoryConflictError,
  type WorkspaceRepository,
  type WorkspaceRepositoryCommit,
  type WorkspaceRepositorySnapshot,
} from "../../../../src/storage/workspaceRepository";
import {
  createWorkspaceSessionController,
  WorkspaceSessionUnavailableError,
  type WorkspaceSessionController,
  type WorkspaceSessionControllerState,
} from "../../../../src/application/workspace/session/workspaceSessionController";
import {
  createInitialWorkspaceData,
  createNoteRecord,
  type WorkspaceData,
} from "../../../../src/workspace/model/workspaceData";
import { stripTestCtnBlockMetadata } from "../../../ctn/metadata/sourceMetadataFixture";

function createDeferred<Value>() {
  let resolve = (_value: Value) => {};
  let reject = (_error: unknown) => {};
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

function createWorkspace(source = "标题\n内容"): WorkspaceData {
  const note = createNoteRecord(
    "note-1",
    source,
    "2026-07-13T00:00:00.000Z",
  );

  return {
    ...createInitialWorkspaceData(),
    notes: [note],
    tree: [{ id: "tree-note-1", kind: "note", noteId: note.id }],
  };
}

function createSnapshot(
  revision: string,
  workspace = createWorkspace(),
): WorkspaceRepositorySnapshot {
  return {
    availability: "online",
    repositoryPath: "/repository",
    revision,
    syntaxSourceFile: null,
    workspace,
  };
}

function waitForState(
  controller: WorkspaceSessionController,
  predicate: (state: WorkspaceSessionControllerState) => boolean,
) {
  const currentState = controller.getState();

  if (predicate(currentState)) {
    return Promise.resolve(currentState);
  }

  return new Promise<WorkspaceSessionControllerState>((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      const state = controller.getState();

      if (predicate(state)) {
        unsubscribe();
        resolve(state);
      }
    });
  });
}

describe("workspace session controller", () => {
  it("does not expose a mutable fallback workspace while loading", async () => {
    const load = createDeferred<WorkspaceRepositorySnapshot>();
    const commits: WorkspaceRepositoryCommit[] = [];
    const controller = createWorkspaceSessionController({
      repository: {
        commitSnapshot: async (commit) => {
          commits.push(commit);
          return { availability: "online", revision: "revision-2" };
        },
        discardPendingCommit: async () => undefined,
        label: "test repository",
        loadSnapshot: () => load.promise,
      },
    });

    controller.start();

    expect(controller.getState()).toEqual({
      status: "loading",
      storageLabel: "test repository",
    });
    expect(() =>
      controller.commands.updateNoteSource("note-1", "错误覆盖"),
    ).toThrow(WorkspaceSessionUnavailableError);
    expect(commits).toEqual([]);

    load.resolve(createSnapshot("revision-1"));
    await waitForState(controller, (state) => state.status === "ready");
    controller.dispose();
  });

  it("advances repository revisions only through confirmed commits", async () => {
    const commits: WorkspaceRepositoryCommit[] = [];
    const repository: WorkspaceRepository = {
      async commitSnapshot(commit) {
        commits.push(commit);
        return {
          availability: "online",
          revision: `revision-${commits.length + 1}`,
        };
      },
      discardPendingCommit: async () => undefined,
      label: "test repository",
      loadSnapshot: async () => createSnapshot("revision-1"),
    };
    const controller = createWorkspaceSessionController({ repository });

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");

    controller.commands.updateNoteSource("note-1", "标题\n第一次");
    await controller.flushPendingChanges();
    controller.commands.updateNoteSource("note-1", "标题\n第二次");
    await controller.flushPendingChanges();

    expect(commits.map((commit) => commit.baseRevision)).toEqual([
      "revision-1",
      "revision-2",
    ]);
    expect(commits[1]?.workspace.notes[0]?.source).toBe("标题\n第二次");
    controller.dispose();
  });

  it("initializes block metadata when repository syntax is created", async () => {
    const commits: WorkspaceRepositoryCommit[] = [];
    const controller = createWorkspaceSessionController({
      repository: {
        async commitSnapshot(commit) {
          commits.push(commit);
          return { availability: "online", revision: "revision-2" };
        },
        discardPendingCommit: async () => undefined,
        label: "test repository",
        loadSnapshot: async () => createSnapshot("revision-1"),
      },
    });

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    await controller.useDefaultWorkspaceSyntax();

    expect(commits).toHaveLength(1);
    expect(commits[0].syntaxSourceFile).not.toBeNull();
    expect(commits[0].workspace.notes[0].source).toContain("@ctn-block id=");
    expect(
      stripTestCtnBlockMetadata(commits[0].workspace.notes[0].source),
    ).toBe("标题\n内容");
    expect(controller.getState()).toMatchObject({
      context: expect.any(Object),
      status: "ready",
    });
    controller.dispose();
  });

  it("ignores a completed load from an obsolete generation", async () => {
    const firstLoad = createDeferred<WorkspaceRepositorySnapshot>();
    const secondLoad = createDeferred<WorkspaceRepositorySnapshot>();
    let loadCount = 0;
    const controller = createWorkspaceSessionController({
      repository: {
        commitSnapshot: async () => ({
          availability: "online",
          revision: "unused",
        }),
        discardPendingCommit: async () => undefined,
        label: "test repository",
        loadSnapshot() {
          loadCount += 1;
          return loadCount === 1 ? firstLoad.promise : secondLoad.promise;
        },
      },
    });

    controller.start();
    const reload = controller.reload();
    firstLoad.resolve(createSnapshot("obsolete", createWorkspace("旧标题")));
    await Promise.resolve();

    expect(controller.getState().status).toBe("loading");

    secondLoad.resolve(createSnapshot("current", createWorkspace("新标题")));
    await reload;

    const state = controller.getState();

    expect(state.status).toBe("ready");
    expect(state.status === "ready" ? state.workspace.data.notes[0]?.source : "")
      .toBe("新标题");
    controller.dispose();
  });

  it("keeps local content and the remote revision when a commit conflicts", async () => {
    const controller = createWorkspaceSessionController({
      repository: {
        commitSnapshot: async () => {
          throw new WorkspaceRepositoryConflictError("revision-remote");
        },
        discardPendingCommit: async () => undefined,
        label: "test repository",
        loadSnapshot: async () => createSnapshot("revision-local"),
      },
    });

    controller.start();
    await waitForState(controller, (state) => state.status === "ready");
    controller.commands.updateNoteSource("note-1", "标题\n本地修改");

    await expect(controller.flushPendingChanges()).rejects.toThrow(
      WorkspaceRepositoryConflictError,
    );

    const state = controller.getState();

    expect(state.status).toBe("conflict");
    expect(state.status === "conflict" ? state.currentRevision : "")
      .toBe("revision-remote");
    expect(
      state.status === "conflict"
        ? state.workspace.data.notes[0]?.source
        : "",
    ).toBe("标题\n本地修改");
    controller.dispose();
  });

  it("keeps an offline snapshot available for editing", async () => {
    const controller = createWorkspaceSessionController({
      repository: {
        commitSnapshot: async () => ({
          availability: "offline",
          revision: "local-revision-2",
        }),
        discardPendingCommit: async () => undefined,
        label: "remote repository",
        loadSnapshot: async () => ({
          ...createSnapshot("local-revision-1"),
          availability: "offline",
        }),
      },
    });

    controller.start();
    const ready = await waitForState(
      controller,
      (state) => state.status === "ready",
    );

    expect(ready).toMatchObject({
      availability: "offline",
      status: "ready",
    });
    controller.commands.updateNoteSource("note-1", "标题\n离线修改");
    await controller.flushPendingChanges();
    expect(controller.getState()).toMatchObject({
      availability: "offline",
      saveStatus: "saved",
      status: "ready",
    });
    controller.dispose();
  });

  it("loads retained local content as an explicit conflict", async () => {
    const controller = createWorkspaceSessionController({
      repository: {
        commitSnapshot: async () => ({
          availability: "online",
          revision: "unused",
        }),
        discardPendingCommit: async () => undefined,
        label: "remote repository",
        loadSnapshot: async () => ({
          ...createSnapshot(
            "local-pending-revision",
            createWorkspace("标题\n本地待同步"),
          ),
          availability: "conflict",
          currentRevision: "remote-revision",
        }),
      },
    });

    controller.start();
    const conflict = await waitForState(
      controller,
      (state) => state.status === "conflict",
    );

    expect(conflict).toMatchObject({
      availability: "conflict",
      currentRevision: "remote-revision",
      saveStatus: "error",
      status: "conflict",
    });
    expect(
      conflict.status === "conflict"
        ? conflict.workspace.data.notes[0]?.source
        : "",
    ).toBe("标题\n本地待同步");
    controller.dispose();
  });

  it("discards the persisted pending commit before reloading", async () => {
    const events: string[] = [];
    let loadCount = 0;
    const controller = createWorkspaceSessionController({
      repository: {
        commitSnapshot: async () => ({
          availability: "online",
          revision: "unused",
        }),
        async discardPendingCommit() {
          events.push("discard");
        },
        label: "remote repository",
        async loadSnapshot() {
          loadCount += 1;
          events.push(`load-${loadCount}`);
          return loadCount === 1
            ? {
                ...createSnapshot(
                  "local-pending-revision",
                  createWorkspace("标题\n本地待同步"),
                ),
                availability: "conflict",
                currentRevision: "remote-revision",
              }
            : createSnapshot(
                "remote-revision",
                createWorkspace("标题\n远端内容"),
              );
        },
      },
    });

    controller.start();
    await waitForState(controller, (state) => state.status === "conflict");
    await controller.discardPendingChangesAndReload();

    expect(events).toEqual(["load-1", "discard", "load-2"]);
    expect(controller.getState()).toMatchObject({
      availability: "online",
      status: "ready",
    });
    controller.dispose();
  });
});
