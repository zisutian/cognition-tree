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
  createVersionedContentSessionController,
  type VersionedContentSessionState,
} from "../repository/versionedContentSessionController";

export type JournalSessionState = VersionedContentSessionState<
  JournalContent,
  JournalRevision,
  BuiltInLocalDraftRevision
>;
export type JournalPersistenceState = Extract<
  JournalSessionState,
  { status: "ready" }
>["persistence"];

export function createJournalSessionController(
  repository: JournalRepository | null,
) {
  return createVersionedContentSessionController({
    label: "Journal",
    parseContent: (value) =>
      validateJournalContent(value as JournalContentValue),
    repository,
  });
}

export type JournalSessionController = ReturnType<
  typeof createJournalSessionController
>;
