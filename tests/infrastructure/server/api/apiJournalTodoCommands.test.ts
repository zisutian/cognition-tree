// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type {
  ApiCommandResultDto,
  ApiCtnDocumentDto,
  ApiJournalEntriesDto,
  ApiSearchResponseDto,
  ApiTodoCollectionDto,
  ApiTodoCollectionsDto,
} from "../../../../contracts/api/types.ts";
import {
  commandId,
  dispatch,
  withHandler,
} from "./support/apiServerTestHarness.ts";

describe("CTN API v2", () => {
  it("projects Journal and Todo resources and timestamps Todo semantic changes", async () => {
    await withHandler(async (handler) => {
      const journal = await dispatch<ApiJournalEntriesDto>(handler, {
        method: "GET",
        url: "/api/v2/journal/entries",
      });
      const createdEntry = await dispatch<ApiCommandResultDto>(handler, {
        body: {
          commandId: commandId(10),
          command: {
            body: ": 记录 API",
            kind: "create-entry",
          },
          mode: "commit",
          preconditions: {
            expectedEntriesVersion: journal.body!.entriesVersion,
          },
        },
        method: "POST",
        url: "/api/v2/journal/commands",
      });
      if (
        createdEntry.body?.result.kind !== "journal-entry-created"
      ) {
        throw new Error("expected created journal entry");
      }
      const entryId = createdEntry.body.result.entryId;
      const entry = await dispatch<ApiCtnDocumentDto>(handler, {
        method: "GET",
        url: `/api/v2/journal/entries/${entryId}`,
      });

      expect(entry.body).toMatchObject({
        editableText: ": 记录 API",
        resourceId: entryId,
        textMode: "body",
      });

      const todo = await dispatch<ApiTodoCollectionsDto>(handler, {
        method: "GET",
        url: "/api/v2/todo/collections",
      });
      const createdCollection = await dispatch<ApiCommandResultDto>(handler, {
        body: {
          commandId: commandId(11),
          command: {
            body: "[] 远程任务\n[] 远程任务二",
            kind: "create-collection",
            name: "远程集合",
          },
          mode: "commit",
          preconditions: { expectedOrderVersion: todo.body!.orderVersion },
        },
        method: "POST",
        url: "/api/v2/todo/commands",
      });
      if (
        createdCollection.body?.result.kind !==
          "todo-collection-created"
      ) {
        throw new Error("expected created Todo collection");
      }
      const collectionId = createdCollection.body.result.collectionId;
      const collection = await dispatch<ApiTodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v2/todo/collections/${collectionId}`,
      });
      const item = collection.body!.items[0]!;
      const completed = await dispatch<ApiCommandResultDto>(handler, {
        body: {
          commandId: commandId(12),
          command: {
            blockId: item.blockId,
            collectionId,
            completed: true,
            kind: "set-completion",
            occurrenceDate: null,
          },
          mode: "commit",
          preconditions: { expectedStateVersion: item.stateVersion },
        },
        method: "POST",
        url: "/api/v2/todo/commands",
      });

      expect(completed.body!.changes.blocks).toContainEqual(
        expect.objectContaining({
          blockId: item.blockId,
          kind: "state-updated",
          updatedAt: "2026-07-29T12:00:00.000Z",
        }),
      );
      const updated = await dispatch<ApiTodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v2/todo/collections/${collectionId}`,
      });

      expect(updated.body!.items[0]).toMatchObject({ completed: true });
      expect(
        updated.body!.document.blocks.find(
          ({ blockId }) => blockId === item.blockId,
        )?.updatedAt,
      ).toBe("2026-07-29T12:00:00.000Z");
      const recurring = await dispatch<ApiCommandResultDto>(handler, {
        body: {
          commandId: commandId(13),
          command: {
            blockId: item.blockId,
            collectionId,
            kind: "set-recurrence",
            rule: { interval: 1, kind: "daily" },
          },
          mode: "commit",
          preconditions: {
            expectedStateVersion: updated.body!.items[0]!.stateVersion,
          },
        },
        method: "POST",
        url: "/api/v2/todo/commands",
      });

      expect(recurring.statusCode).toBe(200);
      const active = await dispatch<ApiTodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v2/todo/collections/${collectionId}`,
      });

      expect(active.body!.items[0]).toMatchObject({
        completed: true,
        recurrence: {
          active: true,
          completedCount: 1,
          currentOccurrenceDate: "2026-07-29",
          totalCount: 1,
        },
      });
      await dispatch<ApiCommandResultDto>(handler, {
        body: {
          commandId: commandId(14),
          command: {
            blockId: item.blockId,
            collectionId,
            kind: "stop-recurrence",
          },
          mode: "commit",
          preconditions: {
            expectedStateVersion: active.body!.items[0]!.stateVersion,
          },
        },
        method: "POST",
        url: "/api/v2/todo/commands",
      });
      const stopped = await dispatch<ApiTodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v2/todo/collections/${collectionId}`,
      });

      expect(stopped.body!.items[0]).toMatchObject({
        completed: true,
        recurrence: {
          active: false,
          completedCount: 1,
          currentOccurrenceDate: null,
          nextOccurrenceDate: null,
          totalCount: 1,
        },
      });
      const search = await dispatch<ApiSearchResponseDto>(handler, {
        body: {
          domains: ["todo"],
          limit: 1,
          query: "远程",
        },
        method: "POST",
        url: "/api/v2/search",
      });

      expect(search.body).toMatchObject({
        cursor: expect.any(String),
        faults: [],
        results: [{
          domain: "todo",
          resourceId: collectionId,
          version: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        }],
      });
      const ordinaryCompletion = await dispatch<ApiCommandResultDto>(
        handler,
        {
          body: {
            commandId: commandId(15),
            command: {
              blockId: item.blockId,
              collectionId,
              completed: false,
              kind: "set-completion",
              occurrenceDate: null,
            },
            mode: "commit",
            preconditions: {
              expectedStateVersion: stopped.body!.items[0]!.stateVersion,
            },
          },
          method: "POST",
          url: "/api/v2/todo/commands",
        },
      );
      const ordinary = await dispatch<ApiTodoCollectionDto>(handler, {
        method: "GET",
        url: `/api/v2/todo/collections/${collectionId}`,
      });

      expect(ordinaryCompletion.statusCode).toBe(200);
      expect(ordinary.body!.items[0]).toMatchObject({
        completed: false,
        recurrence: {
          active: false,
          completedCount: 1,
        },
      });
      const staleSearchPage = await dispatch<{ code: string }>(handler, {
        body: {
          cursor: search.body!.cursor,
          domains: ["todo"],
          limit: 1,
          query: "远程",
        },
        method: "POST",
        url: "/api/v2/search",
      });

      expect(staleSearchPage).toMatchObject({
        body: {
          code: "resource_conflict",
          details: { restartRequired: true },
        },
        statusCode: 409,
      });
      const staleOccurrence = await dispatch<{ code: string }>(handler, {
        body: {
          commandId: commandId(16),
          command: {
            blockId: item.blockId,
            collectionId,
            completed: true,
            kind: "set-completion",
            occurrenceDate: "2026-07-29",
          },
          mode: "commit",
          preconditions: {
            expectedStateVersion: ordinary.body!.items[0]!.stateVersion,
          },
        },
        method: "POST",
        url: "/api/v2/todo/commands",
      });

      expect(staleOccurrence).toMatchObject({
        body: {
          code: "occurrence_conflict",
          details: { currentOccurrenceDate: null },
        },
        statusCode: 409,
      });
    });
  });
});
