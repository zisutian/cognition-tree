// SPDX-License-Identifier: GPL-3.0-or-later

import { createMyersTextEdits } from "../../../core/ctn/metadata/myersTextEdits";
import type {
  JournalContent,
  JournalEntryId,
} from "../../../core/journal/model/journalContent";
import {
  createEmptyJournalContent,
  listJournalEntries,
} from "../../../core/journal/model/journalContent";
import {
  consumeJournalFocusRequest,
  createJournalFocusRequest,
  createJournalMutationActions,
  normalizeJournalBodyLineNumber,
  requireJournalContent,
  resolveRequestedJournalSelectionAfterDelete,
  type JournalApplicationServices,
  type JournalDeleteMutationResult,
} from "../../../src/application/journal/journalApplication";
import type { SystemRepositoryContent } from "../../../src/storage/repository/systemRepository";
import { describe, expect, it } from "vitest";

function entryId(index: number): JournalEntryId {
  return `journal-entry-00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function blockId(index: number) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function createEmptyContent(): JournalContent {
  return createEmptyJournalContent();
}

function createServices({
  entryIds,
  timestamps,
}: {
  entryIds: JournalEntryId[];
  timestamps: string[];
}) {
  let blockIndex = 1;
  let entryIndex = 0;
  let timestampIndex = 0;

  return {
    createBlockId: () => blockId(blockIndex++),
    createEntryId: () => {
      const id = entryIds[entryIndex++];

      if (!id) {
        throw new Error("Missing test journal entry id.");
      }
      return id;
    },
    now: () => {
      const timestamp = timestamps[timestampIndex++];

      if (!timestamp) {
        throw new Error("Missing test journal timestamp.");
      }
      return new Date(timestamp);
    },
  } satisfies JournalApplicationServices;
}

function createFunctionalSession(initial: JournalContent) {
  let content: SystemRepositoryContent = initial;
  const visibleEntryCounts: number[] = [];

  return {
    get content() {
      return requireJournalContent(content);
    },
    session: {
      updateContent(
        update: (current: SystemRepositoryContent) => SystemRepositoryContent,
      ) {
        content = update(content);
        visibleEntryCounts.push(listJournalEntries(
          requireJournalContent(content),
        ).length);
      },
    },
    visibleEntryCounts,
  };
}

function sourceChange(previousSource: string, source: string) {
  return {
    edits: createMyersTextEdits(previousSource, source),
    source,
  };
}

describe("journal application mutations", () => {
  it("uses functional session mutations so consecutive creates and edits cannot lose data", () => {
    const harness = createFunctionalSession(createEmptyContent());
    const created: JournalEntryId[] = [];
    const services = createServices({
      entryIds: [entryId(1), entryId(2)],
      timestamps: [
        "2026-07-18T00:00:01.000Z",
        "2026-07-18T00:00:02.000Z",
        "2026-07-18T00:00:03.000Z",
        "2026-07-18T00:00:04.000Z",
      ],
    });
    const actions = createJournalMutationActions({
      onCreated: (id) => created.push(id),
      onDeleted: () => undefined,
      services,
      session: harness.session,
    });

    actions.createEntry();
    actions.createEntry();
    actions.updateEntryBody(
      entryId(1),
      sourceChange("", "第一条正文"),
    );
    actions.updateEntryBody(
      entryId(2),
      sourceChange("", "第二条正文"),
    );

    expect(created).toEqual([entryId(1), entryId(2)]);
    expect(harness.visibleEntryCounts).toEqual([1, 2, 2, 2]);
    expect(listJournalEntries(harness.content).map(({ id }) => id)).toEqual([
      entryId(1),
      entryId(2),
    ]);
    expect(listJournalEntries(harness.content)[0]?.source).toContain("第一条正文");
    expect(listJournalEntries(harness.content)[1]?.source).toContain("第二条正文");
  });

  it("selects a created entry and chooses next then previous around deletion", () => {
    const harness = createFunctionalSession(createEmptyContent());
    let requestedEntryId: JournalEntryId | null = null;
    const deleteResults: JournalDeleteMutationResult[] = [];
    const actions = createJournalMutationActions({
      onCreated: (id) => {
        requestedEntryId = id;
      },
      onDeleted: (result) => {
        deleteResults.push(result);
        requestedEntryId = resolveRequestedJournalSelectionAfterDelete({
          ...result,
          requestedEntryId,
        });
      },
      services: createServices({
        entryIds: [entryId(1), entryId(2), entryId(3)],
        timestamps: [
          "2026-07-18T00:00:01.000Z",
          "2026-07-18T00:00:02.000Z",
          "2026-07-18T00:00:03.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createEntry();
    actions.createEntry();
    actions.createEntry();
    expect(requestedEntryId).toBe(entryId(3));

    requestedEntryId = entryId(2);
    expect(actions.deleteEntry(entryId(2))).toBe(entryId(1));
    expect(requestedEntryId).toBe(entryId(1));

    expect(actions.deleteEntry(entryId(1))).toBe(entryId(3));
    expect(requestedEntryId).toBe(entryId(3));
    expect(deleteResults).toHaveLength(2);
    expect(listJournalEntries(harness.content).map(({ id }) => id)).toEqual([
      entryId(3),
    ]);
  });

  it("keeps another selected entry stable when a non-selected entry is deleted", () => {
    const harness = createFunctionalSession(createEmptyContent());
    let requestedEntryId: JournalEntryId | null = null;
    const actions = createJournalMutationActions({
      onCreated: (id) => {
        requestedEntryId = id;
      },
      onDeleted: (result) => {
        requestedEntryId = resolveRequestedJournalSelectionAfterDelete({
          ...result,
          requestedEntryId,
        });
      },
      services: createServices({
        entryIds: [entryId(1), entryId(2)],
        timestamps: [
          "2026-07-18T00:00:01.000Z",
          "2026-07-18T00:00:02.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createEntry();
    actions.createEntry();
    requestedEntryId = entryId(2);
    actions.deleteEntry(entryId(1));

    expect(requestedEntryId).toBe(entryId(2));
  });

  it("normalizes and consumes one-shot body focus requests", () => {
    const request = createJournalFocusRequest(7, entryId(1), 3.9);

    expect(request).toEqual({
      entryId: entryId(1),
      lineNumber: 3,
      requestId: 7,
    });
    expect(consumeJournalFocusRequest(request, 6)).toBe(request);
    expect(consumeJournalFocusRequest(request, 7)).toBeNull();
    expect(normalizeJournalBodyLineNumber(Number.NaN)).toBe(1);
    expect(normalizeJournalBodyLineNumber(-2)).toBe(1);
  });

  it("does not move an entry timestamp backwards when the browser clock regresses", () => {
    const harness = createFunctionalSession(createEmptyContent());
    const actions = createJournalMutationActions({
      onCreated: () => undefined,
      onDeleted: () => undefined,
      services: createServices({
        entryIds: [entryId(1)],
        timestamps: [
          "2026-07-18T00:10:00.000Z",
          "2026-07-18T00:05:00.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createEntry();
    actions.updateEntryBody(entryId(1), sourceChange("", "正文"));

    expect(listJournalEntries(harness.content)[0]?.updatedAt).toBe(
      "2026-07-18T00:10:00.000Z",
    );
  });

  it("rejects non-journal system content at the application boundary", () => {
    expect(() => requireJournalContent({
      collections: [],
      purpose: "system-todo",
      schemaVersion: 3,
      syntaxSource: "",
    })).toThrow("received non-journal content");
  });
});
