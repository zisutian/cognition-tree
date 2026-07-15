import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRepositoryContent } from "../../../../src/storage/workspaceRepository";
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

function createContent(
  name: string,
  syntaxSource = `name = "${name} syntax"\n`,
): WorkspaceRepositoryContent {
  return {
    syntaxSourceFile: {
      fileName: "workspace.toml",
      source: syntaxSource,
    },
    workspace: createWorkspaceData(name),
  };
}

function createQueue(
  save: (content: WorkspaceRepositoryContent) => Promise<void>,
  options: {
    onContentSaved?: (content: WorkspaceRepositoryContent) => void;
    onError?: (error: unknown) => void;
    onStatusChange?: (status: WorkspaceSessionSaveStatus) => void;
  } = {},
) {
  return createWorkspaceSessionSaveQueue({
    onContentSaved: options.onContentSaved ?? (() => undefined),
    onError: options.onError ?? (() => undefined),
    onStatusChange: options.onStatusChange ?? (() => undefined),
    save,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("workspace session save queue", () => {
  it("serializes commits while replacing pending content with the latest snapshot", async () => {
    let releaseFirstSave = () => {};
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });
    const saved: WorkspaceRepositoryContent[] = [];
    const queue = createQueue(async (content) => {
      saved.push(content);

      if (content.workspace.name === "first") {
        await firstSaveGate;
      }
    });

    queue.enqueue(createContent("first"));
    const activeFlush = queue.flush();

    queue.enqueue(createContent("second"));
    const latestSave = queue.enqueueAndWait(createContent("latest"));
    releaseFirstSave();

    await activeFlush;
    await latestSave;

    expect(saved.map((content) => content.workspace.name)).toEqual([
      "first",
      "latest",
    ]);
    expect(saved[1].syntaxSourceFile?.source).toBe(
      'name = "latest syntax"\n',
    );
  });

  it("debounces pending content and flushes it immediately on demand", async () => {
    vi.useFakeTimers();

    const savedNames: string[] = [];
    const queue = createQueue(async (content) => {
      savedNames.push(content.workspace.name);
    });

    queue.enqueue(createContent("debounced"));
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs - 1);
    expect(savedNames).toEqual([]);

    await queue.flush();
    expect(savedNames).toEqual(["debounced"]);

    queue.enqueue(createContent("timer"));
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    expect(savedNames).toEqual(["debounced", "timer"]);
  });

  it("keeps the newer complete snapshot when an active commit fails", async () => {
    let releaseFailedSave = () => {};
    const failedSaveGate = new Promise<void>((resolve) => {
      releaseFailedSave = resolve;
    });
    const savedNames: string[] = [];
    const statuses: WorkspaceSessionSaveStatus[] = [];
    let shouldFail = true;
    const queue = createQueue(
      async (content) => {
        savedNames.push(content.workspace.name);

        if (shouldFail) {
          await failedSaveGate;
          shouldFail = false;
          throw new Error("save failed");
        }
      },
      {
        onStatusChange(status) {
          statuses.push(status);
        },
      },
    );

    queue.enqueue(createContent("first"));
    const failedFlush = queue.flush();
    queue.enqueue(createContent("latest"));
    releaseFailedSave();

    await expect(failedFlush).rejects.toThrow("save failed");
    await queue.flush();

    expect(savedNames).toEqual(["first", "latest"]);
    expect(statuses).toContain("error");
    expect(statuses[statuses.length - 1]).toBe("saved");
  });

  it("retains failed content for an explicit retry", async () => {
    const savedNames: string[] = [];
    const confirmedNames: string[] = [];
    let shouldFail = true;
    const queue = createQueue(
      async (content) => {
        savedNames.push(content.workspace.name);

        if (shouldFail) {
          shouldFail = false;
          throw new Error("commit failed");
        }
      },
      {
        onContentSaved(content) {
          confirmedNames.push(content.workspace.name);
        },
      },
    );

    const save = queue.enqueueAndWait(createContent("pending"));
    const rejectedSave = expect(save).rejects.toThrow("commit failed");

    await expect(queue.flush()).rejects.toThrow("commit failed");
    await rejectedSave;
    await queue.flush();

    expect(savedNames).toEqual(["pending", "pending"]);
    expect(confirmedNames).toEqual(["pending"]);
  });

  it("resolves superseded waiters after the latest snapshot is committed", async () => {
    const savedNames: string[] = [];
    const queue = createQueue(async (content) => {
      savedNames.push(content.workspace.name);
    });

    const firstSave = queue.enqueueAndWait(createContent("first"));
    const latestSave = queue.enqueueAndWait(createContent("latest"));

    await queue.flush();
    await Promise.all([firstSave, latestSave]);

    expect(savedNames).toEqual(["latest"]);
  });

  it("discards pending content without committing it", async () => {
    const savedNames: string[] = [];
    const queue = createQueue(async (content) => {
      savedNames.push(content.workspace.name);
    });
    const save = queue.enqueueAndWait(createContent("discarded"));
    const rejectedSave = expect(save).rejects.toThrow(
      "Pending repository changes were discarded",
    );

    await queue.discardPendingChanges();
    await rejectedSave;
    await queue.flush();

    expect(savedNames).toEqual([]);
  });

  it("does not commit a newer pending snapshot while discarding an active save", async () => {
    let releaseActiveSave = () => {};
    const activeSaveGate = new Promise<void>((resolve) => {
      releaseActiveSave = resolve;
    });
    const savedNames: string[] = [];
    const queue = createQueue(async (content) => {
      savedNames.push(content.workspace.name);

      if (content.workspace.name === "active") {
        await activeSaveGate;
      }
    });

    queue.enqueue(createContent("active"));
    const activeFlush = queue.flush();
    const pendingSave = queue.enqueueAndWait(createContent("pending"));
    const rejectedPendingSave = expect(pendingSave).rejects.toThrow(
      "Pending repository changes were discarded",
    );
    const discard = queue.discardPendingChanges();

    releaseActiveSave();
    await activeFlush;
    await discard;
    await rejectedPendingSave;

    expect(savedNames).toEqual(["active"]);
  });

  it("does not requeue an active save that fails during discard", async () => {
    let releaseActiveSave = () => {};
    const activeSaveGate = new Promise<void>((resolve) => {
      releaseActiveSave = resolve;
    });
    const savedNames: string[] = [];
    const statuses: WorkspaceSessionSaveStatus[] = [];
    const queue = createQueue(
      async (content) => {
        savedNames.push(content.workspace.name);
        await activeSaveGate;
        throw new Error("active save failed");
      },
      {
        onStatusChange(status) {
          statuses.push(status);
        },
      },
    );
    const activeSave = queue.enqueueAndWait(createContent("active"));
    const rejectedActiveSave = expect(activeSave).rejects.toThrow(
      "Pending repository changes were discarded",
    );
    const activeFlush = queue.flush();
    const discard = queue.discardPendingChanges();

    releaseActiveSave();
    await expect(activeFlush).rejects.toThrow("active save failed");
    await discard;
    await rejectedActiveSave;
    await queue.flush();

    expect(savedNames).toEqual(["active"]);
    expect(statuses[statuses.length - 1]).toBe("idle");
  });

  it("keeps content enqueued after discard starts", async () => {
    let releaseActiveSave = () => {};
    const activeSaveGate = new Promise<void>((resolve) => {
      releaseActiveSave = resolve;
    });
    const savedNames: string[] = [];
    const queue = createQueue(async (content) => {
      savedNames.push(content.workspace.name);

      if (content.workspace.name === "active") {
        await activeSaveGate;
      }
    });

    queue.enqueue(createContent("active"));
    const activeFlush = queue.flush();
    const discard = queue.discardPendingChanges();
    const nextSave = queue.enqueueAndWait(createContent("after-discard"));

    releaseActiveSave();
    await activeFlush;
    await discard;

    expect(savedNames).toEqual(["active"]);

    await queue.flush();
    await nextSave;

    expect(savedNames).toEqual(["active", "after-discard"]);
  });

  it("cancels timers and waiters when its owning session is disposed", async () => {
    vi.useFakeTimers();

    const savedNames: string[] = [];
    const queue = createQueue(async (content) => {
      savedNames.push(content.workspace.name);
    });
    const pendingSave = queue.enqueueAndWait(createContent("disposed"));
    const rejectedSave = expect(pendingSave).rejects.toThrow(
      "Workspace session save queue was disposed",
    );

    queue.dispose();
    await vi.advanceTimersByTimeAsync(workspaceSessionSaveDelayMs);
    await rejectedSave;

    expect(savedNames).toEqual([]);
  });
});
