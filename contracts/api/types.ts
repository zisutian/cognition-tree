// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * API wire types are inferred from the runtime schemas. This compatibility-free
 * barrel keeps imports short without becoming a second contract owner.
 */
export {
  apiAutomationScopes,
  apiScopes,
} from "./schemas/foundation.ts";
export type {
  ApiCapabilitiesDto,
  ApiCommandModeDto,
  ApiErrorCodeDto,
  ApiErrorDto,
  ApiPrincipalDto,
  ApiResourceVersionDto,
  ApiScope,
} from "./schemas/foundation.ts";
export type {
  ApiBlockChangeDto,
  ApiCommandOutcomeDto,
  ApiCommandResultDto,
  ApiCommittedCommandResultDto,
  ApiDomainChangeSetDto,
  ApiPreviewCommandResultDto,
  ApiResourceChangeDto,
  ApiTextDiffHunkDto,
} from "./schemas/transitions.ts";
export type {
  ApiCtnBlockDto,
  ApiCtnDiagnosticDto,
  ApiCtnDocumentDto,
  ApiJournalEntriesDto,
  ApiJournalEntrySummaryDto,
  ApiSyntaxBlockRuleDto,
  ApiSyntaxGuideDto,
  ApiTodoCollectionDto,
  ApiTodoCollectionSummaryDto,
  ApiTodoCollectionsDto,
  ApiTodoItemStateDto,
  ApiTodoRecurrenceProjectionDto,
  ApiWorkspaceListDto,
  ApiWorkspaceSummaryDto,
  ApiWorkspaceTreeDto,
  ApiWorkspaceTreeNodeDto,
} from "./schemas/resources.ts";
export type {
  ApiChangeEventDto,
  ApiCheckpointEventDto,
  ApiEventDto,
  ApiRevisionCheckpointDto,
} from "./schemas/events.ts";
export type {
  ApiJournalCommandRequestDto,
  ApiTodoCommandRequestDto,
  ApiWorkspaceCommandRequestDto,
} from "./schemas/commands.ts";
export type {
  ApiSearchFaultDto,
  ApiSearchRequestDto,
  ApiSearchResponseDto,
  ApiSearchResultDto,
} from "./schemas/search.ts";
export type {
  ApiAuditEntryDto,
  ApiAuditPageDto,
  ApiCreateTokenRequestDto,
  ApiCreatedTokenDto,
  ApiTokenDto,
} from "./schemas/admin.ts";
