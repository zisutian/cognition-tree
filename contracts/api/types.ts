// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * API wire types are inferred from the runtime schemas. This compatibility-free
 * barrel keeps imports short without becoming a second contract owner.
 */
export type {
DomainBlockChangeDto,
DomainChangeSetDto,
DomainResourceChangeDto,
DomainTextDiffHunkDto
} from "../common/index.ts";
export type {
ApiChangeEventDto,
ApiCheckpointEventDto,
ApiEventDto,
ApiRevisionCheckpointDto
} from "./schemas/events.ts";
export type {
ApiCapabilitiesDto,
ApiErrorCodeDto,
ApiErrorDto,
ApiPrincipalDto,
ApiResourceVersionDto
} from "./schemas/foundation.ts";
export type {
ApiOperationAuditEntryDto,
ApiOperationAuditPageDto,
ApiOperationAuditStatusDto
} from "./schemas/operations.ts";
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
ApiWorkspaceTreeNodeDto
} from "./schemas/resources.ts";
export type {
ApiSearchFaultDto,
ApiSearchRequestDto,
ApiSearchResponseDto,
ApiSearchResultDto
} from "./schemas/search.ts";
