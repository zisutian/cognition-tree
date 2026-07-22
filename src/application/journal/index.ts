// SPDX-License-Identifier: GPL-3.0-or-later

export {
  consumeJournalFocusRequest,
  createBrowserJournalApplicationServices,
  createJournalFocusRequest,
  createJournalMutationActions,
  normalizeJournalBodyLineNumber,
  requireJournalContent,
  resolveRequestedJournalSelectionAfterDelete,
  type JournalApplication,
  type JournalApplicationServices,
  type JournalDeleteMutationResult,
  type JournalMutationActions,
  type JournalSystemRepositorySession,
} from "./journalApplication";
export {
  createJournalDiagnostics,
  createJournalDocumentDiagnostics,
  createJournalReferenceDiagnostics,
  type JournalDiagnostic,
  type JournalDiagnostics,
  type JournalDiagnosticSeverity,
  type JournalDiagnosticSource,
} from "./journalDiagnostics";
export {
  createJournalViewModel,
  type JournalActiveBodyPosition,
  type JournalEntryListItem,
  type JournalFocusRequest,
  type JournalCalendarDayView,
  type JournalCalendarMonthView,
  type JournalCalendarYearView,
  type JournalOutlineNode,
  type JournalTextDisplay,
  type JournalTextSegment,
  type JournalViewModel,
} from "./journalViewModel";
export { useJournalApplication } from "./useJournalApplication";
export {
  createJournalWorkspaceReferenceResolver,
  findJournalWorkspaceReferenceResolution,
  routeJournalWorkspaceNoteDestination,
  routeJournalWorkspaceNoteDestinationWithoutSession,
  startJournalWorkspaceReferenceResolution,
  type JournalWorkspaceNoteDestination,
  type JournalWorkspaceReferenceFaultCode,
  type JournalWorkspaceReferenceResolution,
  type JournalWorkspaceReferenceResolutionState,
  type JournalWorkspaceReferenceResolver,
  type JournalWorkspaceReferenceSnapshot,
} from "./journalWorkspaceReferences";
