// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createTodoCollectionBodyProjection } from "../../../core/todo/model/todoCollectionProjection";
import type {
  TodoCollectionId,
  TodoContent,
} from "../../../core/todo/model/todoContent";
import {
  createTodoMutationActions,
  requireTodoContent,
  resolveRequestedTodoSelectionAfterDelete,
  type TodoApplicationServices,
  type TodoDeleteCollectionMutationResult,
} from "../../../application/todo/todoApplication";
import {
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
} from "../../core/todo/todoTestFixture";
import {
  createTodoParseIndex,
} from "../../../core/todo/indexes/todoParseIndex";

function createServices({
  blockIds,
  collectionIds,
  timestamps,
}: {
  blockIds: string[];
  collectionIds: TodoCollectionId[];
  timestamps: string[];
}) {
  let blockIndex = 0;
  let collectionIndex = 0;
  let recurrenceIndex = 0;
  let timestampIndex = 0;

  return {
    createBlockId: () => {
      const id = blockIds[blockIndex++];
      if (!id) throw new Error("Missing test Todo block id.");
      return id;
    },
    createCollectionId: () => {
      const id = collectionIds[collectionIndex++];
      if (!id) throw new Error("Missing test Todo collection id.");
      return id;
    },
    createRecurrenceStageId: () =>
      `todo-recurrence-stage-00000000-0000-4000-8000-${String(
        ++recurrenceIndex,
      ).padStart(12, "0")}`,
    localCalendar: {
      subscribe: () => () => undefined,
      today: () => "2026-07-18",
    },
    now: () => {
      const timestamp = timestamps[timestampIndex++];
      if (!timestamp) throw new Error("Missing test Todo timestamp.");
      return new Date(timestamp);
    },
  } satisfies TodoApplicationServices;
}

function createFunctionalSession(initial: TodoContent) {
  let content = initial;
  let projection = createTodoParseIndex(content);
  const visibleStates: string[] = [];

  return {
    get content() {
      return content;
    },
    session: {
      mutate(
        update: (current: TodoContent) => TodoContent,
      ) {
        content = requireTodoContent(update(content));
        projection = createTodoParseIndex(content, projection);
        visibleStates.push(JSON.stringify(content));
      },
      mutatePrepared(
        update: (
          current: {
            content: TodoContent;
            projection: typeof projection;
          },
        ) => {
          content: TodoContent;
          projection: typeof projection;
        },
      ) {
        const prepared = update({ content, projection });

        content = requireTodoContent(prepared.content);
        projection = prepared.projection;
        visibleStates.push(JSON.stringify(content));
      },
    },
    visibleStates,
  };
}

function appendTask(
  content: TodoContent,
  actions: ReturnType<typeof createTodoMutationActions>,
  collectionId: TodoCollectionId,
  text: string,
) {
  const projection = createTodoCollectionBodyProjection(
    createTodoParseIndex(content).getParsedCollection(collectionId)!,
  );
  const insertedText = `${projection.source ? "\n" : ""}[] ${text}`;

  actions.updateCollectionBody(collectionId, {
    edits: [{
      from: projection.source.length,
      insertedText,
      to: projection.source.length,
    }],
    source: `${projection.source}${insertedText}`,
  });
}

describe("Todo application mutations", () => {
  it("uses functional updates for CTN editing, completion, rename, and ordering", () => {
    const harness = createFunctionalSession(createEmptyTodoContent());
    const actions = createTodoMutationActions({
      onCollectionCreated: () => undefined,
      onCollectionDeleted: () => undefined,
      services: createServices({
        blockIds: [todoBlockId(101), todoBlockId(102), todoBlockId(1)],
        collectionIds: [todoCollectionId(1), todoCollectionId(2)],
        timestamps: [
          "2026-07-18T01:00:00.000Z",
          "2026-07-18T02:00:00.000Z",
          "2026-07-18T03:00:00.000Z",
          "2026-07-18T04:00:00.000Z",
          "2026-07-18T05:00:00.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createCollection("收集箱");
    actions.createCollection("稍后");
    appendTask(harness.content, actions, todoCollectionId(1), "第一项");
    actions.toggleBlock(todoCollectionId(1), todoBlockId(1));
    actions.renameCollection(todoCollectionId(2), "计划");
    actions.moveCollection(todoCollectionId(2), 0);

    expect(harness.visibleStates).toHaveLength(6);
    expect(harness.content.collections.map(({ id }) => id)).toEqual([
      todoCollectionId(2),
      todoCollectionId(1),
    ]);
    expect(harness.content.collections[1]!.source).toContain("[] 第一项");
    expect(harness.content.collections[1]!.completions).toEqual([
      { blockId: todoBlockId(1), completedAt: "2026-07-18T04:00:00.000Z" },
    ]);
  });

  it("selects created collections and the adjacent collection after deletion", () => {
    const harness = createFunctionalSession(createEmptyTodoContent());
    let requested: TodoCollectionId | null = null;
    const actions = createTodoMutationActions({
      onCollectionCreated: (id) => {
        requested = id;
      },
      onCollectionDeleted: (result: TodoDeleteCollectionMutationResult) => {
        requested = resolveRequestedTodoSelectionAfterDelete({
          ...result,
          requestedCollectionId: requested,
        });
      },
      services: createServices({
        blockIds: [todoBlockId(101), todoBlockId(102)],
        collectionIds: [todoCollectionId(1), todoCollectionId(2)],
        timestamps: [
          "2026-07-18T01:00:00.000Z",
          "2026-07-18T02:00:00.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createCollection("一");
    actions.createCollection("二");
    requested = todoCollectionId(1);
    expect(actions.deleteCollection(todoCollectionId(1))).toBe(
      todoCollectionId(2),
    );
    expect(requested).toBe(todoCollectionId(2));
  });

  it("clamps generated timestamps against canonical block history", () => {
    const harness = createFunctionalSession(createEmptyTodoContent());
    const actions = createTodoMutationActions({
      onCollectionCreated: () => undefined,
      onCollectionDeleted: () => undefined,
      services: createServices({
        blockIds: [todoBlockId(101), todoBlockId(1)],
        collectionIds: [todoCollectionId(1)],
        timestamps: [
          "2026-07-18T10:00:00.000Z",
          "2026-07-18T05:00:00.000Z",
          "2026-07-18T04:00:00.000Z",
        ],
      }),
      session: harness.session,
    });

    actions.createCollection("一");
    appendTask(harness.content, actions, todoCollectionId(1), "任务");
    actions.toggleBlock(todoCollectionId(1), todoBlockId(1));

    expect(harness.content.collections[0]!.completions[0]!.completedAt).toBe(
      "2026-07-18T10:00:00.000Z",
    );
  });

  it("rejects non-Todo content", () => {
    expect(() => requireTodoContent({
      days: [],
      schemaVersion: 3,
      syntaxSource: "",
    } as unknown as TodoContent)).toThrow();
  });
});
