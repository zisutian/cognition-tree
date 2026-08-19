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
import {
  recoverTodoLocalConflictCopiesPrepared,
  type TodoConflictRecoveryDependencies,
} from "../sync/domainConflictRecovery";

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
  recoveryDependencies?: TodoConflictRecoveryDependencies,
) {
  const base = createVersionedSessionController({
    label: "Todo",
    prepareContent: (content, previous) =>
      createTodoParseIndex(content, previous),
    repository,
    scheduler,
  });

  return {
    ...base,
    recoverLocalConflictCopy() {
      if (!recoveryDependencies) {
        throw new Error("Todo conflict recovery is unavailable.");
      }
      return base.resolvePreparedConflictAndSynchronize(
        "remote",
        (prepared, conflict, sources) =>
          recoverTodoLocalConflictCopiesPrepared(
            prepared,
            conflict,
            recoveryDependencies,
            sources?.local,
          ),
      );
    },
  };
}

export type TodoSessionController = ReturnType<typeof createTodoSessionController>;
