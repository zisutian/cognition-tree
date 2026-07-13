import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInitialWorkspaceData,
  type WorkspaceData,
} from "../../../../src/workspace/model/workspaceData";
import {
  createWorkspaceSessionSaveQueue,
  workspaceSessionSaveDelayMs,
  type WorkspaceSessionSaveStatus,
} from "../../../../src/application/workspace/session/workspaceSessionSaveQueue";

function createWorkspaceData(name: string): WorkspaceData {
  return {
    ...createInitialWorkspaceData(),
    name,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("workspace session save queue", () => {
  it("serializes workspace and syntax saves while keeping the latest snapshot", async () => {
    let releaseFirstSave = () => {};
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const saveOrder: string[] = [];
    const queue = createWorkspaceSessionSaveQueue({
      onError() {
        throw new Error("save should not fail");
      },
      onStatusChange() {},
      onSyntaxSourceSaved() {},
      async saveSyntaxSource(source) {
        saveOrder.push(`syntax:${source}`);
      },
      async saveWorkspace(workspace) {
        saveOrder.push(`workspace:${workspace.name}`);

        if (workspace.name === "first") {
          await firstSaveGate;
        }
      },
    });

    queue.enqueueWorkspace(createWorkspaceData("first"));
    const activeFlush = queue.flush();

    queue.enqueueWorkspace(createWorkspaceData("second"));
    queue.enqueueWorkspace(createWorkspaceData("latest"));
    const syntaxSave = queue.enqueueSyntaxSource("syntax-latest");
    releaseFirstSave();

    await activeFlush;
    await syntaxSave;

    expect(saveOrder).toEqual([
      "workspace:first",
      "workspace:latest",
      "syntax:syntax-latest",
    ]);
  });

  it("debounces pending changes and flushes them immediately on demand", async () => {
    vi.useFakeTimers();

    const savedWorkspaceNames: string[] = [];
    const queue = createWorkspaceSessionSaveQueue({
      onError() {},
      onStatusChange() {},
      onSyntaxSourceSaved() {},
      async saveSyntaxSource() {},
      async saveWorkspace(workspace) {
        savedWorkspaceNames.push(workspace.name);
      },
    });

    queue.enqueueWorkspace(createWorkspaceData("debounced"));
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs - 1);
    expect(savedWorkspaceNames).toEqual([]);

    await queue.flush();
    expect(savedWorkspaceNames).toEqual(["debounced"]);

    queue.enqueueWorkspace(createWorkspaceData("timer"));
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    expect(savedWorkspaceNames).toEqual(["debounced", "timer"]);
  });

  it("preserves the latest workspace snapshot after a failed save", async () => {
    let releaseFailedSave = () => {};
    const failedSaveGate = new Promise<void>((resolve) => {
      releaseFailedSave = resolve;
    });
    const savedWorkspaceNames: string[] = [];
    const statuses: WorkspaceSessionSaveStatus[] = [];
    let shouldFail = true;
    const queue = createWorkspaceSessionSaveQueue({
      onError() {},
      onStatusChange(status) {
        statuses.push(status);
      },
      onSyntaxSourceSaved() {},
      async saveSyntaxSource() {},
      async saveWorkspace(workspace) {
        savedWorkspaceNames.push(workspace.name);

        if (shouldFail) {
          await failedSaveGate;
          shouldFail = false;
          throw new Error("save failed");
        }
      },
    });

    queue.enqueueWorkspace(createWorkspaceData("first"));
    const failedFlush = queue.flush();
    queue.enqueueWorkspace(createWorkspaceData("latest"));
    releaseFailedSave();

    await expect(failedFlush).rejects.toThrow("save failed");
    await queue.flush();

    expect(savedWorkspaceNames).toEqual(["first", "latest"]);
    expect(statuses).toContain("error");
    expect(statuses[statuses.length - 1]).toBe("saved");
  });

  it("retains failed syntax source for flush retry", async () => {
    const savedSyntaxSources: string[] = [];
    const confirmedSyntaxSources: string[] = [];
    let shouldFail = true;
    const queue = createWorkspaceSessionSaveQueue({
      onError() {},
      onStatusChange() {},
      onSyntaxSourceSaved(source) {
        confirmedSyntaxSources.push(source);
      },
      async saveSyntaxSource(source) {
        savedSyntaxSources.push(source);

        if (shouldFail) {
          shouldFail = false;
          throw new Error("syntax save failed");
        }
      },
      async saveWorkspace() {},
    });

    const syntaxSave = queue.enqueueSyntaxSource("syntax-source");
    const syntaxFailure = expect(syntaxSave).rejects.toThrow(
      "syntax save failed",
    );

    await expect(queue.flush()).rejects.toThrow("syntax save failed");
    await syntaxFailure;
    await queue.flush();

    expect(savedSyntaxSources).toEqual(["syntax-source", "syntax-source"]);
    expect(confirmedSyntaxSources).toEqual(["syntax-source"]);
  });

  it("resolves superseded syntax saves when the latest source is stored", async () => {
    const savedSyntaxSources: string[] = [];
    const queue = createWorkspaceSessionSaveQueue({
      onError() {},
      onStatusChange() {},
      onSyntaxSourceSaved() {},
      async saveSyntaxSource(source) {
        savedSyntaxSources.push(source);
      },
      async saveWorkspace() {},
    });

    const firstSave = queue.enqueueSyntaxSource("first");
    const latestSave = queue.enqueueSyntaxSource("latest");

    await queue.flush();
    await Promise.all([firstSave, latestSave]);

    expect(savedSyntaxSources).toEqual(["latest"]);
  });
});
