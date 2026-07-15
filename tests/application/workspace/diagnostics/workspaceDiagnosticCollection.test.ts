import { describe, expect, it } from "vitest";
import { defaultCtnSyntaxProfile } from "../../../../src/ctn/syntax/defaultSyntaxProfile";
import { startWorkspaceDiagnosticCollection } from "../../../../src/application/workspace/diagnostics/workspaceDiagnosticCollection";
import { createWorkspaceParseIndex } from "../../../../src/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../../src/workspace/indexes/workspaceStructureIndex";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../../src/workspace/model/workspaceData";
import { addTestCtnBlockMetadata } from "../../../ctn/metadata/sourceMetadataFixture";

const timestamp = "2026-07-15T00:00:00.000Z";

function createIndex(noteCount: number) {
  const notes = Array.from({ length: noteCount }, (_, index) =>
    createNoteRecord(
      `note-${index}`,
      addTestCtnBlockMetadata(
        index === 0
          ? "Note 0\n\t? Unknown\n\t: [[Missing]]"
          : `Note ${index}`,
        defaultCtnSyntaxProfile,
        index * 100,
      ),
      timestamp,
    ),
  );

  return createWorkspaceParseIndex({
    syntaxProfile: defaultCtnSyntaxProfile,
    workspace: createWorkspaceStructureIndex({
      ...createInitialWorkspaceData(),
      notes,
    }),
  });
}

describe("workspace diagnostic collection", () => {
  it("collects at most 25 notes per scheduled batch", () => {
    const index = createIndex(26);
    const tasks: Array<() => void> = [];
    const updates: Array<{ count: number; status: string }> = [];

    startWorkspaceDiagnosticCollection({
      index,
      now: () => 0,
      onUpdate(view) {
        updates.push({ count: view.diagnostics.length, status: view.status });
      },
      schedule(task) {
        tasks.push(task);
        return () => undefined;
      },
    });

    expect(tasks).toHaveLength(1);
    tasks.shift()?.();
    expect(index.parseCache.entriesById).toHaveLength(25);
    expect(tasks).toHaveLength(1);
    tasks.shift()?.();

    expect(index.parseCache.entriesById).toHaveLength(26);
    expect(updates.at(-1)).toEqual({ count: 4, status: "ready" });
  });

  it("yields when the current batch reaches its time budget", () => {
    const index = createIndex(4);
    const tasks: Array<() => void> = [];
    const times = [0, 1, 9, 10, 11, 12];

    startWorkspaceDiagnosticCollection({
      index,
      now: () => times.shift() ?? 12,
      onUpdate: () => undefined,
      schedule(task) {
        tasks.push(task);
        return () => undefined;
      },
    });

    tasks.shift()?.();

    expect(index.parseCache.entriesById).toHaveLength(2);
    expect(tasks).toHaveLength(1);
  });

  it("stops publishing when a stale generation is cancelled", () => {
    const tasks: Array<() => void> = [];
    const statuses: string[] = [];
    const cancel = startWorkspaceDiagnosticCollection({
      index: createIndex(2),
      onUpdate(view) {
        statuses.push(view.status);
      },
      schedule(task) {
        tasks.push(task);
        return () => undefined;
      },
    });

    cancel();
    tasks.forEach((task) => task());

    expect(statuses).toEqual(["collecting"]);
  });
});
