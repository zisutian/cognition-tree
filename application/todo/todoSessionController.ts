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
  createVersionedContentSessionController,
  type VersionedContentSessionState,
} from "../repository/versionedContentSessionController";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";

export type TodoSessionState = VersionedContentSessionState<
  TodoContent,
  TodoRevision,
  BuiltInLocalDraftRevision
>;
export type TodoPersistenceState = Extract<
  TodoSessionState,
  { status: "ready" }
>["persistence"];

export function createTodoSessionController(
  repository: TodoRepository | null,
  scheduler: Pick<ApplicationScheduler, "schedule">,
) {
  return createVersionedContentSessionController({
    label: "Todo",
    parseContent: (value) => validateTodoContent(value as TodoContentValue),
    repository,
    scheduler,
  });
}

export type TodoSessionController = ReturnType<typeof createTodoSessionController>;
