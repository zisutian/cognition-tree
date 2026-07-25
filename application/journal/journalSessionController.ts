// SPDX-License-Identifier: GPL-3.0-or-later

import {
  validateJournalContent,
  type JournalContent,
  type JournalContentValue,
} from "../../core/journal/model/journalContent";
import type {
  BuiltInLocalDraftRevision,
  JournalRevision,
  JournalRepository,
} from "../repository/builtInRepository";
import {
  createVersionedSessionController,
  type VersionedSessionState,
} from "../repository/versionedSessionController";
import type { ApplicationScheduler } from "../runtime/applicationScheduler";

export type JournalSessionState = VersionedSessionState<
  JournalContent,
  JournalContent,
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
) {
  return createVersionedSessionController({
    label: "Journal",
    parseContent: (value) =>
      validateJournalContent(value as JournalContentValue),
    prepareContent: (content) => content,
    repository,
    scheduler,
  });
}

export type JournalSessionController = ReturnType<
  typeof createJournalSessionController
>;
