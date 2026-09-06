// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type JournalContent,
  type JournalParseIndex,
} from "../../core/journal/index.ts";
import type {
  JournalLocalDraftRevision,
  JournalRevision,
  JournalRepository,
} from "./persistence/journalRepository.ts";
import {
  createVersionedSessionController,
  type VersionedSessionState,
} from "../persistence/index.ts";
import type { ApplicationScheduler } from "../runtime/index.ts";

import {
  recoverJournalLocalConflictCopies,
  type JournalConflictRecoveryDependencies,
} from "./persistence/journalConflictRecovery.ts";

export type JournalSessionState = VersionedSessionState<
  JournalContent,
  JournalParseIndex,
  JournalRevision,
  JournalLocalDraftRevision,
  JournalRepository["location"]
>;
export type JournalPersistenceState = Extract<
  JournalSessionState,
  { status: "ready" }
>["persistence"];

export function createJournalSessionController(
  repository: JournalRepository | null,
  scheduler: Pick<ApplicationScheduler, "schedule">,
  recoveryDependencies?: JournalConflictRecoveryDependencies,
) {
  const base = createVersionedSessionController({
    label: "Journal",
    repository,
    scheduler,
  });

  return {
    ...base,
    recoverLocalConflictCopy() {
      if (!recoveryDependencies) {
        throw new Error("Journal conflict recovery is unavailable.");
      }
      return base.resolveConflictAndSynchronize(
        "remote",
        (prepared, conflict, sources) =>
          recoverJournalLocalConflictCopies(
            prepared,
            conflict,
            recoveryDependencies,
            sources.local,
          ),
      );
    },
  };
}

export type JournalSessionController = ReturnType<
  typeof createJournalSessionController
>;
