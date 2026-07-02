import { describe, expect, it } from "vitest";
import {
  createInitialWorkspaceData,
  type WorkspaceData,
} from "../../src/domain/notes";
import {
  createWorkspaceSaveQueue,
  type WorkspaceSaveStatus,
} from "../../src/workspace/workspaceSaveQueue";

function createWorkspace(name: string): WorkspaceData {
  return {
    ...createInitialWorkspaceData(),
    name,
  };
}

describe("workspace save queue", () => {
  it("serializes saves and coalesces pending snapshots", async () => {
    let releaseFirstSave = () => {};
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const savedNames: string[] = [];
    const statuses: WorkspaceSaveStatus[] = [];
    const queue = createWorkspaceSaveQueue({
      onError() {
        throw new Error("save should not fail");
      },
      onStatusChange(status) {
        statuses.push(status);
      },
      async save(workspace) {
        savedNames.push(workspace.name);

        if (workspace.name === "first") {
          await firstSaveGate;
        }
      },
    });

    queue.enqueue(createWorkspace("first"));
    queue.enqueue(createWorkspace("second"));
    queue.enqueue(createWorkspace("latest"));
    releaseFirstSave();
    await queue.waitForIdle();

    expect(savedNames).toEqual(["first", "latest"]);
    expect(statuses).toEqual(["saving", "saving", "saved"]);
  });

  it("reports errors and accepts a later save", async () => {
    const savedNames: string[] = [];
    const errors: unknown[] = [];
    const statuses: WorkspaceSaveStatus[] = [];
    let shouldFail = true;
    const queue = createWorkspaceSaveQueue({
      onError(error) {
        errors.push(error);
      },
      onStatusChange(status) {
        statuses.push(status);
      },
      async save(workspace) {
        savedNames.push(workspace.name);

        if (shouldFail) {
          shouldFail = false;
          throw new Error("save failed");
        }
      },
    });

    queue.enqueue(createWorkspace("first"));
    await queue.waitForIdle();
    queue.enqueue(createWorkspace("second"));
    await queue.waitForIdle();

    expect(savedNames).toEqual(["first", "second"]);
    expect(errors).toHaveLength(1);
    expect(statuses).toEqual(["saving", "error", "saving", "saved"]);
  });
});
