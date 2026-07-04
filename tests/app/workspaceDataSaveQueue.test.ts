import { describe, expect, it } from "vitest";
import {
  createInitialWorkspaceData,
  type WorkspaceData,
} from "../../src/workspace/model/workspaceData";
import {
  createWorkspaceDataSaveQueue,
  type WorkspaceSaveStatus,
} from "../../src/app/runtime/workspaceDataSaveQueue";

function createWorkspaceData(name: string): WorkspaceData {
  return {
    ...createInitialWorkspaceData(),
    name,
  };
}

describe("workspace data save queue", () => {
  it("serializes saves and coalesces pending snapshots", async () => {
    let releaseFirstSave = () => {};
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const savedWorkspaceDataNames: string[] = [];
    const statuses: WorkspaceSaveStatus[] = [];
    const queue = createWorkspaceDataSaveQueue({
      onError() {
        throw new Error("save should not fail");
      },
      onStatusChange(status) {
        statuses.push(status);
      },
      async save(workspaceData) {
        savedWorkspaceDataNames.push(workspaceData.name);

        if (workspaceData.name === "first") {
          await firstSaveGate;
        }
      },
    });

    queue.enqueue(createWorkspaceData("first"));
    queue.enqueue(createWorkspaceData("second"));
    queue.enqueue(createWorkspaceData("latest"));
    releaseFirstSave();
    await queue.waitForIdle();

    expect(savedWorkspaceDataNames).toEqual(["first", "latest"]);
    expect(statuses).toEqual(["saving", "saving", "saved"]);
  });

  it("reports errors and accepts a later save", async () => {
    const savedWorkspaceDataNames: string[] = [];
    const errors: unknown[] = [];
    const statuses: WorkspaceSaveStatus[] = [];
    let shouldFail = true;
    const queue = createWorkspaceDataSaveQueue({
      onError(error) {
        errors.push(error);
      },
      onStatusChange(status) {
        statuses.push(status);
      },
      async save(workspaceData) {
        savedWorkspaceDataNames.push(workspaceData.name);

        if (shouldFail) {
          shouldFail = false;
          throw new Error("save failed");
        }
      },
    });

    queue.enqueue(createWorkspaceData("first"));
    await queue.waitForIdle();
    queue.enqueue(createWorkspaceData("second"));
    await queue.waitForIdle();

    expect(savedWorkspaceDataNames).toEqual(["first", "second"]);
    expect(errors).toHaveLength(1);
    expect(statuses).toEqual(["saving", "error", "saving", "saved"]);
  });
});
