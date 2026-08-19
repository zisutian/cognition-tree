// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type JournalContent,
} from "../../core/journal/model/journalContent";
import type {
  JournalLocalDraftRevision,
  JournalRevision,
  JournalRepository,
} from "./persistence/journalRepository";
import {
  createVersionedSessionController,
  type VersionedSessionState,
} from "../persistence/versionedSessionController";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import {
  type JournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex";
import {
  recoverJournalLocalConflictCopies,
  type JournalConflictRecoveryDependencies,
} from "./persistence/journalConflictRecovery";

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
