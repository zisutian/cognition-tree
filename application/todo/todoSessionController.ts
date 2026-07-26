// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type TodoContent,
} from "../../core/todo/model/todoContent";
import type {
  BuiltInLocalDraftRevision,
  TodoRevision,
  TodoRepository,
} from "../repository/builtInRepository";
import {
  createVersionedSessionController,
  type VersionedSessionState,
} from "../persistence/versionedSessionController";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../core/todo/indexes/todoParseIndex";

export type TodoSessionState = VersionedSessionState<
  TodoContent,
  TodoParseIndex,
  TodoRevision,
  BuiltInLocalDraftRevision,
  TodoRepository["location"]
>;
export type TodoPersistenceState = Extract<
  TodoSessionState,
  { status: "ready" }
>["persistence"];

export function createTodoSessionController(
  repository: TodoRepository | null,
  scheduler: Pick<ApplicationScheduler, "schedule">,
) {
  let previousIndex: TodoParseIndex | null = null;

  return createVersionedSessionController({
    label: "Todo",
    parseContent: (value) => value as TodoContent,
    prepareContent(content) {
      const index = createTodoParseIndex(content, previousIndex);

      previousIndex = index;
      return index;
    },
    repository,
    scheduler,
  });
}

export type TodoSessionController = ReturnType<typeof createTodoSessionController>;
