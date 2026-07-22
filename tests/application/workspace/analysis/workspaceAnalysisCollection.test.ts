import { describe, expect, it } from "vitest";
import { startWorkspaceAnalysisCollection } from "../../../../src/application/workspace/analysis/workspaceAnalysisCollection";
import type { WorkspaceAnalysis } from "../../../../src/application/workspace/analysis/workspaceAnalysis";
import { defaultCtnSyntaxProfile } from "../../../../core/ctn/syntax/defaultSyntaxProfile";
import { createWorkspaceParseIndex } from "../../../../core/workspace/indexes/workspaceParseIndex";
import { createWorkspaceStructureIndex } from "../../../../core/workspace/indexes/workspaceStructureIndex";
import {
  createInitialWorkspaceData,
  createNoteRecord,
} from "../../../../core/workspace/model/workspaceData";
import { addTestCtnBlockMetadata } from "../../../ctn/metadata/sourceMetadataFixture";

function createIndex(sources: Array<{ id: string; source: string }>) {
  const notes = sources.map(({ id, source }, index) =>
    createNoteRecord(
      id,
      addTestCtnBlockMetadata(
        source,
        defaultCtnSyntaxProfile,
        index * 100,
      ),
    )
  );

  return createWorkspaceParseIndex({
    syntaxProfile: defaultCtnSyntaxProfile,
    workspace: createWorkspaceStructureIndex({
      ...createInitialWorkspaceData(),
      notes,
      tree: notes.map((note) => ({ kind: "note" as const, noteId: note.id })),
    }),
  });
}

function drainScheduledTasks(tasks: Array<() => void>) {
  while (tasks.length > 0) {
    tasks.shift()?.();
  }
}

describe("workspace analysis collection", () => {
  it("parses in bounded batches and publishes one complete analysis snapshot", () => {
    const index = createIndex(Array.from({ length: 26 }, (_, noteIndex) => ({
      id: `note-${noteIndex}`,
      source: noteIndex === 0
        ? "Note 0\n\t? Unknown\n\t: [[Missing]]"
        : `Note ${noteIndex}`,
    })));
    const tasks: Array<() => void> = [];
    const updates: Array<{ parsedCount: number; status: string }> = [];

    startWorkspaceAnalysisCollection({
      index,
      now: () => 0,
      onUpdate(analysis) {
        updates.push({
          parsedCount: analysis.parsedNotesById.size,
          status: analysis.status,
        });
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
    drainScheduledTasks(tasks);

    expect(index.parseCache.entriesById).toHaveLength(26);
    expect(updates.at(-1)).toEqual({ parsedCount: 26, status: "ready" });
  });

  it("publishes parsed notes, diagnostics, title candidates and the graph from the same scan", () => {
    const index = createIndex([
      {
        id: "alpha",
        source: "Alpha\n\t: [[Twin]]\n\t: [[Alpha]]\n\t: [[Missing]]",
      },
      { id: "twin-a", source: "Twin" },
      { id: "twin-b", source: "Twin" },
    ]);
    const tasks: Array<() => void> = [];
    const updates: WorkspaceAnalysis[] = [];

    startWorkspaceAnalysisCollection({
      index,
      onUpdate(analysis) {
        updates.push(analysis);
      },
      schedule(task) {
        tasks.push(task);
        return () => undefined;
      },
    });
    drainScheduledTasks(tasks);

    const analysis = updates.at(-1);

    expect(analysis?.status).toBe("ready");
    expect(analysis?.parsedNotesById.size).toBe(3);
    expect(analysis?.titleIndex.get("Twin")?.map((note) => note.id)).toEqual([
      "twin-a",
      "twin-b",
    ]);
    expect(analysis?.referenceGraph.ambiguousReferences).toEqual([
      expect.objectContaining({
        candidateNoteIds: ["twin-a", "twin-b"],
        sourceNoteId: "alpha",
      }),
    ]);
    expect(analysis?.referenceGraph.edges).toContainEqual(
      expect.objectContaining({
        sourceNoteId: "alpha",
        targetNoteId: "alpha",
      }),
    );
    expect(analysis?.diagnostics.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "ambiguous-global-reference",
        "unresolved-global-reference",
      ]),
    );
  });

  it("stops publishing after a stale generation is cancelled", () => {
    const tasks: Array<() => void> = [];
    const statuses: string[] = [];
    const cancel = startWorkspaceAnalysisCollection({
      index: createIndex([
        { id: "alpha", source: "Alpha" },
        { id: "beta", source: "Beta" },
      ]),
      onUpdate(analysis) {
        statuses.push(analysis.status);
      },
      schedule(task) {
        tasks.push(task);
        return () => undefined;
      },
    });

    cancel();
    drainScheduledTasks(tasks);

    expect(statuses).toEqual(["collecting"]);
  });

  it("yields when a batch reaches its time budget", () => {
    const index = createIndex([
      { id: "a", source: "A" },
      { id: "b", source: "B" },
      { id: "c", source: "C" },
      { id: "d", source: "D" },
    ]);
    const tasks: Array<() => void> = [];
    const times = [0, 1, 9, 10, 11, 12];

    startWorkspaceAnalysisCollection({
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
});
