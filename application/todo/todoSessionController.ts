// SPDX-License-Identifier: GPL-3.0-or-later

import {
  validateTodoContent,
  type TodoContent,
  type TodoContentValue,
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

export type TodoSessionState = VersionedSessionState<
  TodoContent,
  TodoContent,
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
  return createVersionedSessionController({
    label: "Todo",
    parseContent: (value) => validateTodoContent(value as TodoContentValue),
    prepareContent: (content) => content,
    repository,
    scheduler,
  });
}

export type TodoSessionController = ReturnType<typeof createTodoSessionController>;
