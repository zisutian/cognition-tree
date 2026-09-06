// SPDX-License-Identifier: GPL-3.0-or-later

export {
  consumeJournalFocusRequest,
  createJournalFocusRequest,
  createJournalMutationActions,
  normalizeJournalBodyLineNumber,
  resolveRequestedJournalSelectionAfterDelete,
} from "./journalApplication.ts";
export {
  createJournalDiagnostics,
  createJournalDocumentDiagnostics,
  createJournalReferenceDiagnostics,
} from "./journalDiagnostics.ts";
export {
  createJournalSessionController,
} from "./journalSessionController.ts";
export {
  createJournalViewModel,
} from "./journalViewModel.ts";
export {
  findJournalWorkspaceReferenceResolution,
  startJournalWorkspaceReferenceResolution,
} from "./journalExternalReferences.ts";
export type {
  JournalActiveBodyPosition,
  JournalCalendarMonthView,
  JournalCalendarYearView,
  JournalEntryListItem,
  JournalFocusRequest,
  JournalOutlineNode,
  JournalTextDisplay,
  JournalTextSegment,
  JournalViewModel,
} from "./journalViewModel.ts";
export type {
  JournalAgentCommandIntent,
  JournalAgentCommandRuntime,
} from "./journalAgentCommandPreparation.ts";
export type {
  JournalApplication,
  JournalApplicationServices,
  JournalDeleteMutationResult,
  JournalMutationActions,
  JournalRepositorySession,
} from "./journalApplication.ts";
export type {
  JournalDiagnostic,
  JournalDiagnostics,
  JournalDiagnosticSeverity,
  JournalDiagnosticSource,
} from "./journalDiagnostics.ts";
export type {
  JournalDomainVersions,
} from "./journalDomainCommands.ts";
export type {
  JournalRepository,
  JournalRepositoryBackend,
  JournalRepositoryProvider,
  JournalRevision,
} from "./persistence/journalRepository.ts";
export type {
  JournalSessionController,
  JournalSessionState,
} from "./journalSessionController.ts";
export type {
  JournalWorkspaceReferenceDestination,
  JournalWorkspaceReferenceFaultCode,
  JournalWorkspaceReferenceResolution,
  JournalWorkspaceReferenceResolutionState,
  JournalWorkspaceReferenceResolver,
} from "./journalExternalReferences.ts";
export {
  mergeJournalContent,
} from "./persistence/journalThreeWayMerge.ts";
export {
  prepareAgentJournalCommand,
} from "./journalAgentCommandPreparation.ts";
export {
  prepareJournalRepositoryContent,
  validateJournalRepositoryPreparedTransition,
} from "./persistence/journalRepositoryPreparation.ts";
export {
  projectJournalAgentProposalReview,
  projectJournalContentChanges,
} from "./journalContentProjection.ts";
