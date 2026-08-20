// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * API wire types are inferred from the runtime schemas. This compatibility-free
 * barrel keeps imports short without becoming a second contract owner.
 */
export {
  apiAutomationScopes,
} from "./schemas/foundation.ts";
export type {
  AutomationApiScope,
  ApiCapabilitiesDto,
  ApiErrorCodeDto,
  ApiErrorDto,
  ApiPrincipalDto,
  ApiResourceVersionDto,
} from "./schemas/foundation.ts";
export type {
  DomainBlockChangeDto,
  DomainChangeSetDto,
  DomainResourceChangeDto,
  DomainTextDiffHunkDto,
} from "../common/domainChanges.ts";
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
  ApiSearchFaultDto,
  ApiSearchRequestDto,
  ApiSearchResponseDto,
  ApiSearchResultDto,
} from "./schemas/search.ts";
export type {
  ApiCreateTokenRequestDto,
  ApiCreatedTokenDto,
  ApiTokenDto,
} from "./schemas/admin.ts";
