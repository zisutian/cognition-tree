// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type JournalContent,
} from "../../core/journal/model/journalContent";
import type {
  BuiltInLocalDraftRevision,
  JournalRevision,
  JournalRepository,
} from "../repository/builtInRepository";
import {
  createVersionedSessionController,
  type VersionedSessionState,
} from "../persistence/versionedSessionController";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";
import {
  createJournalParseIndex,
  type JournalParseIndex,
} from "../../core/journal/indexes/journalParseIndex";
import {
  recoverJournalLocalConflictCopiesPrepared,
  type JournalConflictRecoveryDependencies,
} from "../sync/domainConflictRecovery";

export type JournalSessionState = VersionedSessionState<
  JournalContent,
  JournalParseIndex,
  JournalRevision,
  BuiltInLocalDraftRevision,
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
    prepareContent: (content, previous) =>
      createJournalParseIndex(content, previous),
    repository,
    scheduler,
  });

  return {
    ...base,
    recoverLocalConflictCopy() {
      if (!recoveryDependencies) {
        throw new Error("Journal conflict recovery is unavailable.");
      }
      return base.resolvePreparedConflictAndSynchronize(
        "remote",
        (prepared, conflict, sources) =>
          recoverJournalLocalConflictCopiesPrepared(
            prepared,
            conflict,
            recoveryDependencies,
            sources?.local,
          ),
      );
    },
  };
}

export type JournalSessionController = ReturnType<
  typeof createJournalSessionController
>;
