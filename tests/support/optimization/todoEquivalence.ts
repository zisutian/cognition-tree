// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import {
  createTodoCollectionBodyProjection,
  createTodoParseIndex,
  setTodoBlockRecurrence,
  stopTodoBlockRecurrence,
  toggleTodoBlock,
  updateTodoCollectionBody,
  type TodoContent,
  type TodoLocalDate,
} from "../../../core/todo/index.ts";
import {
  createTodoDiagnostics,
  createTodoResourceVersions,
} from "../../../application/todo/index.ts";
import { projectTodoItemStates } from "../../../application/todo/todoItemStates.ts";
import {
  appendTodoTestCollection,
  appendTodoTestItem,
  createEmptyTodoContent,
  todoBlockId,
  todoCollectionId,
  todoTimestamp,
} from "../core/todo/todoTestFixture.ts";

const collectionId = todoCollectionId(1);
const blockId = todoBlockId(1);
const digest = (value: unknown) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}` as const;
const versions = createTodoResourceVersions(digest);
const index = (content: TodoContent) => createTodoParseIndex(content);

function capture(content: TodoContent, today: TodoLocalDate) {
  const parsedIndex = index(content);
  const parsed = parsedIndex.getParsedCollection(collectionId)!;
  return {
    collectionVersion: versions.collection(parsed),
    collectionStateVersion: versions.collectionState(parsed.collection),
    diagnostics: createTodoDiagnostics(parsedIndex),
    itemStates: projectTodoItemStates(parsed, today, versions.itemState),
    itemStatesPartial: projectTodoItemStates(
      parsed, today, versions.itemState, new Set([todoBlockId(2)]),
    ),
    orderVersion: versions.order(content),
  };
}

let base = appendTodoTestCollection(createEmptyTodoContent(), {
  collectionIndex: 1,
  createdAt: todoTimestamp(1),
  name: "等价检查",
});
base = appendTodoTestItem(base, {
  collectionIndex: 1, createdAt: todoTimestamp(2), itemIndex: 1,
});
base = appendTodoTestItem(base, {
  collectionIndex: 1, createdAt: todoTimestamp(3), itemIndex: 2,
});
const complete = toggleTodoBlock(base, index(base), {
  blockId, collectionId, completedAt: todoTimestamp(4), today: "2026-07-18",
});
const cancel = toggleTodoBlock(complete, index(complete), {
  blockId, collectionId, completedAt: todoTimestamp(5), today: "2026-07-18",
});
const recurrence = setTodoBlockRecurrence(base, index(base), {
  blockId,
  collectionId,
  rule: { interval: 1, kind: "daily" },
  stageId: "todo-recurrence-stage-00000000-0000-4000-8000-000000000001",
  today: "2026-07-18",
  updatedAt: todoTimestamp(6),
});
const recurrenceCompleted = toggleTodoBlock(recurrence, index(recurrence), {
  blockId, collectionId, completedAt: todoTimestamp(7), today: "2026-07-18",
});
const recurrenceModified = setTodoBlockRecurrence(
  recurrenceCompleted, index(recurrenceCompleted), {
    blockId,
    collectionId,
    rule: { interval: 2, kind: "daily" },
    stageId: "todo-recurrence-stage-00000000-0000-4000-8000-000000000002",
    today: "2026-07-19",
    updatedAt: todoTimestamp(8),
  },
);
const recurrenceStopped = stopTodoBlockRecurrence(
  recurrenceModified, index(recurrenceModified), {
    blockId, collectionId, today: "2026-07-20", updatedAt: todoTimestamp(9),
  },
);
const parsedCompleted = index(complete).getParsedCollection(collectionId)!;
const body = createTodoCollectionBodyProjection(parsedCompleted).source;
const firstLineEnd = body.indexOf("\n") + 1;
const deleted = updateTodoCollectionBody(complete, index(complete), {
  change: {
    edits: [{ from: 0, insertedText: "", to: firstLineEnd }],
    source: body.slice(firstLineEnd),
  },
  collectionId,
  createBlockId: () => todoBlockId(10),
  updatedAt: todoTimestamp(10),
}).content;
const parsedBase = index(base).getParsedCollection(collectionId)!;
const diagnosticBody = createTodoCollectionBodyProjection(parsedBase).source;
const diagnosticText = "\n? invalid";
const diagnosed = updateTodoCollectionBody(base, index(base), {
  change: {
    edits: [{
      from: diagnosticBody.length,
      insertedText: diagnosticText,
      to: diagnosticBody.length,
    }],
    source: diagnosticBody + diagnosticText,
  },
  collectionId,
  createBlockId: () => todoBlockId(11),
  updatedAt: todoTimestamp(11),
}).content;

const scenarios = {
  base: capture(base, "2026-07-18"),
  complete: capture(complete, "2026-07-18"),
  cancel: capture(cancel, "2026-07-18"),
  recurrence: capture(recurrence, "2026-07-18"),
  recurrenceCompleted: capture(recurrenceCompleted, "2026-07-18"),
  recurrenceNextDay: capture(recurrenceCompleted, "2026-07-19"),
  recurrenceModified: capture(recurrenceModified, "2026-07-19"),
  recurrenceStopped: capture(recurrenceStopped, "2026-07-20"),
  deleted: capture(deleted, "2026-07-18"),
  diagnosed: capture(diagnosed, "2026-07-18"),
};

console.log(JSON.stringify(scenarios, null, 2));
