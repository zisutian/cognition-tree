import { describe, expect, it } from "vitest";
import {
  createVersionedSessionController,
  VersionedSessionUnavailableError,
  type VersionedSessionController,
} from "../../../application/persistence/versionedSessionController";
import type {
  VersionedRepository,
  VersionedRepositorySnapshot,
} from "../../../application/persistence/versionedRepository";
import { testApplicationScheduler } from "../../support/testApplicationScheduler";

type TestContent = {
  values: number[];
};

type TestProjection = {
  count: number;
};

type TestRemoteRevision = `remote:${number}`;
type TestLocalRevision = `local:${number}`;
type TestLocation = {
  type: "memory";
};

type TestSnapshot = VersionedRepositorySnapshot<
  TestContent,
  TestRemoteRevision,
  TestLocalRevision,
  TestProjection
>;

type TestController = VersionedSessionController<
  TestContent,
  TestProjection,
  TestRemoteRevision,
  TestLocalRevision,
  TestLocation
>;

function deferred<Value>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    reject = promiseReject;
    resolve = promiseResolve;
  });

  return { promise, reject, resolve };
}

function remoteRevision(index: number): TestRemoteRevision {
  return `remote:${index}`;
}

function localRevision(index: number): TestLocalRevision {
  return `local:${index}`;
}

function createSnapshot(
  overrides: Partial<TestSnapshot> = {},
): TestSnapshot {
  return {
    conflictRevision: null,
    content: { values: [] },
    localRevision: localRevision(0),
    pendingChanges: false,
    projection: { count: 0 },
    remoteRevision: remoteRevision(0),
    ...overrides,
  };
}

type RepositoryHarness = {
  expectedLocalRevisions: TestLocalRevision[];
  getLoadCount(): number;
  getSnapshot(): TestSnapshot;
  repository: VersionedRepository<
    TestContent,
    TestRemoteRevision,
    TestLocalRevision,
    TestLocation,
    TestProjection
  >;
  setBeforeStage(
    hook: (
      content: TestContent,
      stageNumber: number,
    ) => void | Promise<void>,
  ): void;
  setBeforeSynchronize(hook: () => void | Promise<void>): void;
  setDiscard(
    discard: () => TestSnapshot | Promise<TestSnapshot>,
  ): void;
  setLoad(load: () => TestSnapshot | Promise<TestSnapshot>): void;
  stagedContents: TestContent[];
};

function createRepositoryHarness(
  initialSnapshot = createSnapshot(),
): RepositoryHarness {
  let beforeStage: (
    content: TestContent,
    stageNumber: number,
  ) => void | Promise<void> = () => undefined;
  let beforeSynchronize: () => void | Promise<void> = () => undefined;
  let discard: () => TestSnapshot | Promise<TestSnapshot> =
    async () => structuredClone(snapshot);
  let load: () => TestSnapshot | Promise<TestSnapshot> =
    async () => structuredClone(snapshot);
  let loadCount = 0;
  let snapshot = structuredClone(initialSnapshot);
  let stageCount = 0;
  const expectedLocalRevisions: TestLocalRevision[] = [];
  const stagedContents: TestContent[] = [];
  const repository: RepositoryHarness["repository"] = {
    async discardPendingSnapshotAndReload() {
      return await discard();
    },
    label: "test repository",
    async loadSnapshot() {
      loadCount += 1;
      return await load();
    },
    location: { type: "memory" },
    async stageSnapshot({ content, expectedLocalRevision, projection }) {
      const stageNumber = stageCount + 1;

      await beforeStage(content, stageNumber);
      if (expectedLocalRevision !== snapshot.localRevision) {
        throw new Error("unexpected local revision");
      }
      stageCount = stageNumber;
      expectedLocalRevisions.push(expectedLocalRevision);
      stagedContents.push(structuredClone(content));
      snapshot = {
        ...snapshot,
        content: structuredClone(content),
        localRevision: localRevision(stageNumber),
        pendingChanges: true,
        projection: structuredClone(projection),
      };
      return { localRevision: snapshot.localRevision };
    },
    subscribeReconnect: () => () => undefined,
    async synchronizePendingSnapshot() {
      await beforeSynchronize();
      snapshot = {
        ...snapshot,
        conflictRevision: null,
        pendingChanges: false,
        remoteRevision: remoteRevision(1),
      };
      return {
        localRevision: snapshot.localRevision,
        pendingChanges: false,
        remoteRevision: snapshot.remoteRevision,
        status: "synced",
      };
    },
  };

  return {
    expectedLocalRevisions,
    getLoadCount: () => loadCount,
    getSnapshot: () => structuredClone(snapshot),
    repository,
    setBeforeStage(hook) {
      beforeStage = hook;
    },
    setBeforeSynchronize(hook) {
      beforeSynchronize = hook;
    },
    setDiscard(nextDiscard) {
      discard = nextDiscard;
    },
    setLoad(nextLoad) {
      load = nextLoad;
    },
    stagedContents,
  };
}

function createController(
  harness: RepositoryHarness,
): TestController {
  return createVersionedSessionController({
    label: "test",
    repository: harness.repository,
    scheduler: testApplicationScheduler,
  });
}

function waitForReady(controller: TestController) {
  const current = controller.getState();

  if (current.status === "ready") {
    return Promise.resolve(current);
  }
  return new Promise<Extract<
    ReturnType<TestController["getState"]>,
    { status: "ready" }
  >>((resolve) => {
    const unsubscribe = controller.subscribe(() => {
      const state = controller.getState();

      if (state.status === "ready") {
        unsubscribe();
        resolve(state);
      }
    });
  });
}

async function startController(harness: RepositoryHarness) {
  const controller = createController(harness);

  controller.start();
  await waitForReady(controller);
  return controller;
}

function append(value: number) {
  return ({ content }: { content: TestContent; projection: TestProjection }) => {
    const nextContent = { values: [...content.values, value] };

    return {
      content: nextContent,
      projection: { count: nextContent.values.length },
    };
  };
}

describe("versioned session controller", () => {
  it("keeps mutations optimistic while deferred local stages serialize", async () => {
    const firstStage = deferred<void>();
    const harness = createRepositoryHarness();

    harness.setBeforeStage(async (_content, stageNumber) => {
      if (stageNumber === 1) {
        await firstStage.promise;
      }
    });
    const controller = await startController(harness);
    const visibleCounts: number[] = [];

    controller.subscribe(() => {
      const state = controller.getState();

      if (state.status === "ready") {
        visibleCounts.push(state.projection.count);
      }
    });
    controller.mutate(append(1));
    controller.mutate(append(2));

    expect(controller.getState()).toMatchObject({
      content: { values: [1, 2] },
      projection: { count: 2 },
      status: "ready",
    });

    const flush = controller.flushPendingChanges();

    firstStage.resolve();
    await flush;

    expect(harness.stagedContents).toEqual([
      { values: [1] },
      { values: [1, 2] },
    ]);
    const optimisticIndex = visibleCounts.indexOf(2);

    expect(optimisticIndex).toBeGreaterThanOrEqual(0);
    expect(visibleCounts.slice(optimisticIndex)).not.toContain(1);
    controller.dispose();
  });

  it("flushes desired content before a ready-session reload", async () => {
    const stage = deferred<void>();
    const harness = createRepositoryHarness();

    harness.setBeforeStage(() => stage.promise);
    const controller = await startController(harness);

    controller.mutate(append(1));
    const reload = controller.reload();

    await Promise.resolve();
    expect(harness.getLoadCount()).toBe(1);
    stage.resolve();
    await reload;

    expect(harness.getLoadCount()).toBe(2);
    expect(controller.getState()).toMatchObject({
      content: { values: [1] },
      projection: { count: 1 },
      status: "ready",
    });
    controller.dispose();
  });

  it("coordinates reload with active synchronization and edits staged during reads", async () => {
    const syncHarness = createRepositoryHarness();
    const syncStarted = deferred<void>();
    const releaseSync = deferred<void>();

    syncHarness.setBeforeSynchronize(async () => {
      syncStarted.resolve();
      await releaseSync.promise;
    });
    const syncController = await startController(syncHarness);

    syncController.mutate(append(1));
    await syncController.flushPendingChanges();
    syncController.requestSync();
    await syncStarted.promise;
    syncController.mutate(append(2));
    await syncController.flushPendingChanges();

    const synchronizedReload = syncController.reload();

    await Promise.resolve();
    expect(syncHarness.getLoadCount()).toBe(1);
    releaseSync.resolve();
    await synchronizedReload;
    expect(syncHarness.getLoadCount()).toBe(2);

    syncController.mutate(append(3));
    await syncController.flushPendingChanges();
    expect(syncHarness.expectedLocalRevisions).toEqual([
      localRevision(0),
      localRevision(1),
      localRevision(2),
    ]);
    syncController.dispose();

    const readHarness = createRepositoryHarness();
    const readStarted = deferred<void>();
    const releaseRead = deferred<void>();
    const staleSnapshot = readHarness.getSnapshot();
    let reloadReadCount = 0;
    const readController = await startController(readHarness);

    readHarness.setLoad(async () => {
      reloadReadCount += 1;
      if (reloadReadCount === 1) {
        readStarted.resolve();
        await releaseRead.promise;
        return staleSnapshot;
      }
      return readHarness.getSnapshot();
    });
    const concurrentReload = readController.reload();

    await readStarted.promise;
    readController.mutate(append(4));
    await readController.flushPendingChanges();
    releaseRead.resolve();
    await concurrentReload;

    expect(reloadReadCount).toBe(2);
    expect(readController.getState()).toMatchObject({
      content: { values: [4] },
      status: "ready",
    });
    readController.dispose();
  });

  it("restores the ready writable session after transition failures", async () => {
    const harness = createRepositoryHarness();
    const controller = await startController(harness);

    harness.setBeforeStage(() => {
      throw new Error("local stage failed");
    });
    controller.mutate(append(1));
    await expect(controller.discardPendingChangesAndReload())
      .rejects.toThrow("local stage failed");
    expect(controller.canMutate()).toBe(true);

    harness.setBeforeStage(() => undefined);
    await controller.flushPendingChanges();
    harness.setDiscard(() => {
      throw new Error("discard read failed");
    });
    await expect(controller.discardPendingChangesAndReload())
      .rejects.toThrow("discard read failed");
    expect(controller.canMutate()).toBe(true);

    harness.setLoad(() => {
      throw new Error("reload read failed");
    });
    await expect(controller.reload()).rejects.toThrow("reload read failed");
    controller.mutate(append(2));
    await controller.flushPendingChanges();
    expect(controller.getState()).toMatchObject({
      content: { values: [1, 2] },
      status: "ready",
    });
    controller.dispose();
  });

  it("quiesces repository removal and resumes after success or preparation failure", async () => {
    const harness = createRepositoryHarness();
    const controller = await startController(harness);
    const prepared = await controller.prepareForRemoval();

    expect(controller.canMutate()).toBe(false);
    expect(() => controller.mutate(append(1))).toThrow(
      VersionedSessionUnavailableError,
    );
    prepared.resume();
    expect(controller.canMutate()).toBe(true);
    controller.mutate(append(1));
    await controller.flushPendingChanges();
    controller.dispose();

    const failedHarness = createRepositoryHarness();
    const failedController = await startController(failedHarness);

    failedHarness.setBeforeStage(() => {
      throw new Error("removal stage failed");
    });
    failedController.mutate(append(2));
    await expect(failedController.prepareForRemoval())
      .rejects.toThrow("removal stage failed");
    expect(failedController.canMutate()).toBe(true);

    failedHarness.setBeforeStage(() => undefined);
    await failedController.flushPendingChanges();
    failedController.dispose();
  });
});
