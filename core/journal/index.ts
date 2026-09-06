// SPDX-License-Identifier: GPL-3.0-or-later

export {
  createEmptyJournalContent,
  findJournalEntry,
  listJournalEntries,
} from "./model/journalContent.ts";
export {
  createJournalCalendar,
  resolveJournalSelection,
  resolveJournalSelectionAfterDelete,
} from "./queries/journalQueries.ts";
export {
  createJournalEntry,
  deleteJournalEntry,
  updateJournalEntryBody,
  updateJournalSyntaxSource,
} from "./commands/journalCommands.ts";
export {
  createJournalEntryBodyProjection,
} from "./model/journalEntryProjection.ts";
export {
  createJournalParseIndex,
} from "./indexes/journalParseIndex.ts";
export {
  formatJournalEntryDate,
  getJournalCreationTimezoneOffsetMinutes,
  isJournalEntryId,
} from "./model/journalIdentity.ts";
export type {
  JournalCommandOutcome,
} from "./commands/journalCommandOutcome.ts";
export type {
  JournalContent,
  JournalEntryId,
} from "./model/journalContent.ts";
export {
  JournalContentValidationError,
} from "./model/journalErrors.ts";
export type {
  JournalParseIndex,
  JournalWorkspaceReference,
  ParsedJournalIndexEntry,
} from "./indexes/journalParseIndex.ts";
export type {
  JournalReferenceNavigationDestination,
  JournalReferenceNavigationTarget,
} from "./queries/journalReferenceNavigation.ts";
export {
  resolveJournalReferenceNavigation,
} from "./queries/journalReferenceNavigation.ts";
export {
  validateJournalContent,
  validateJournalContentAnalysisTransition,
  validateJournalContentTransition,
} from "./model/journalValidation.ts";
