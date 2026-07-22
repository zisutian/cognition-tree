// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createHttpSystemRepositoryBackend } from "../../../../src/storage/adapters/http/httpSystemRepository";
import type { SystemRepositoryRevision } from "../../../../src/storage/repository/systemRepository";
import {
  validateSystemRepositoryContent,
  validateSystemRepositoryTransition,
} from "../../../../src/storage/repository/systemRepository";
import {
  toggleTodoBlock,
  updateTodoCollectionBody,
} from "../../../../core/todo/commands/todoCommands";
import { createTodoCollectionBodyProjection } from "../../../../core/todo/model/todoContent";
import { requireTodoSyntaxProfile } from "../../../../core/todo/syntax/todoSyntax";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../../../todo/todoTestFixture";

const revisionA = `sha256:${"a".repeat(64)}` as SystemRepositoryRevision;
const revisionB = `sha256:${"b".repeat(64)}` as SystemRepositoryRevision;

function createTodoContent() {
  return appendTodoTestItem(
    appendTodoTestCollection(createEmptyTodoContent(), {
      collectionIndex: 1,
      createdAt: todoTimestamp(1),
    }),
    {
      collectionIndex: 1,
      createdAt: todoTimestamp(2),
      itemIndex: 1,
    },
  );
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
}

function createBackend(fetch: typeof globalThis.fetch) {
  return createHttpSystemRepositoryBackend({
    baseUrl: "https://todo.test",
    fetch,
    purpose: "system-todo",
    validateContent: validateSystemRepositoryContent,
    validateTransition: validateSystemRepositoryTransition,
  });
}

describe("HTTP Todo system repository", () => {
  it("validates known forward transitions before sending a commit", async () => {
    const valid = createTodoContent();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) =>
      init?.method === "PUT"
        ? jsonResponse({ revision: revisionB })
        : jsonResponse({ content: valid, revision: revisionA })
    );
    const backend = createBackend(fetch);
    const invalid = {
      ...valid,
      collections: [{
        ...valid.collections[0]!,
        source: valid.collections[0]!.source.replace(
          `id=${todoBlockId(10_001)} created=${todoTimestamp(1)}`,
          `id=${todoBlockId(10_001)} created=${todoTimestamp(0)}`,
        ),
      }],
    };

    await backend.loadRemoteSnapshot();
    await expect(backend.commitRemoteSnapshot({
      baseRevision: revisionA,
      content: invalid,
    })).rejects.toThrow(/createdAt is immutable/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts a debounced completion followed by a later text edit", async () => {
    const valid = createTodoContent();
    const collection = valid.collections[0]!;
    const completed = toggleTodoBlock(valid, {
      blockId: todoBlockId(1),
      collectionId: todoCollectionId(1),
      completedAt: "2026-07-18T03:30:00.000Z",
    });
    const projection = createTodoCollectionBodyProjection(
      collection,
      requireTodoSyntaxProfile(valid.syntaxSource),
    );
    const from = projection.source.indexOf("任务 1");
    const coalesced = updateTodoCollectionBody(completed, {
      change: {
        edits: [{
          from,
          insertedText: "完成后编辑",
          to: from + "任务 1".length,
        }],
        source: projection.source.replace("任务 1", "完成后编辑"),
      },
      collectionId: todoCollectionId(1),
      createBlockId: () => todoBlockId(99),
      updatedAt: todoTimestamp(5),
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) =>
      init?.method === "PUT"
        ? jsonResponse({ revision: revisionB })
        : jsonResponse({ content: valid, revision: revisionA })
    );
    const backend = createBackend(fetch);

    await backend.loadRemoteSnapshot();
    await expect(backend.commitRemoteSnapshot({
      baseRevision: revisionA,
      content: coalesced,
    })).resolves.toEqual({ revision: revisionB });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
