// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type TodoContent,
  type TodoParseIndex,
} from "../../core/todo/index.ts";
import type {
  TodoLocalDraftRevision,
  TodoRevision,
  TodoRepository,
} from "./persistence/todoRepository.ts";
import {
  createVersionedSessionController,
  type VersionedSessionState,
} from "../persistence/index.ts";
import type { ApplicationScheduler } from "../runtime/index.ts";

import {
  recoverTodoLocalConflictCopies,
  type TodoConflictRecoveryDependencies,
} from "./persistence/todoConflictRecovery.ts";

export type TodoSessionState = VersionedSessionState<
  TodoContent,
  TodoParseIndex,
  TodoRevision,
  TodoLocalDraftRevision,
  TodoRepository["location"]
>;
export type TodoPersistenceState = Extract<
  TodoSessionState,
  { status: "ready" }
>["persistence"];

export function createTodoSessionController(
  repository: TodoRepository | null,
  scheduler: Pick<ApplicationScheduler, "schedule">,
  recoveryDependencies?: TodoConflictRecoveryDependencies,
) {
  const base = createVersionedSessionController({
    label: "Todo",
    repository,
    scheduler,
  });

  return {
    ...base,
    recoverLocalConflictCopy() {
      if (!recoveryDependencies) {
        throw new Error("Todo conflict recovery is unavailable.");
      }
      return base.resolveConflictAndSynchronize(
        "remote",
        (prepared, conflict, sources) =>
          recoverTodoLocalConflictCopies(
            prepared,
            conflict,
            recoveryDependencies,
            sources.local,
          ),
      );
    },
  };
}

export type TodoSessionController = ReturnType<typeof createTodoSessionController>;
