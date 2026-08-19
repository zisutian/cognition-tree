// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * API wire types are inferred from the runtime schemas. This compatibility-free
 * barrel keeps imports short without becoming a second contract owner.
 */
export {
  apiV1AutomationScopes,
  apiV1Scopes,
} from "./schemas/foundation.ts";
export type {
  ApiV1CapabilitiesDto,
  ApiV1CommandModeDto,
  ApiV1ErrorCodeDto,
  ApiV1ErrorDto,
  ApiV1PrincipalDto,
  ApiV1ResourceVersionDto,
  ApiV1Scope,
} from "./schemas/foundation.ts";
export type {
  ApiV1BlockChangeDto,
  ApiV1CommandOutcomeDto,
  ApiV1CommandResultDto,
  ApiV1CommittedCommandResultDto,
  ApiV1DomainChangeSetDto,
  ApiV1PreviewCommandResultDto,
  ApiV1ResourceChangeDto,
  ApiV1TextDiffHunkDto,
} from "./schemas/transitions.ts";
export type {
  ApiV1CtnBlockDto,
  ApiV1CtnDiagnosticDto,
  ApiV1CtnDocumentDto,
  ApiV1JournalEntriesDto,
  ApiV1JournalEntrySummaryDto,
  ApiV1SyntaxBlockRuleDto,
  ApiV1SyntaxGuideDto,
  ApiV1TodoCollectionDto,
  ApiV1TodoCollectionSummaryDto,
  ApiV1TodoCollectionsDto,
  ApiV1TodoItemStateDto,
  ApiV1TodoRecurrenceProjectionDto,
  ApiV1WorkspaceListDto,
  ApiV1WorkspaceSummaryDto,
  ApiV1WorkspaceTreeDto,
  ApiV1WorkspaceTreeNodeDto,
} from "./schemas/resources.ts";
export type {
  ApiV1ChangeEventDto,
  ApiV1CheckpointEventDto,
  ApiV1EventDto,
  ApiV1RevisionCheckpointDto,
} from "./schemas/events.ts";
export type {
  ApiV1JournalCommandDto,
  ApiV1TodoCommandDto,
  ApiV1WorkspaceCommandDto,
} from "./schemas/commands.ts";
export type {
  ApiV1SearchFaultDto,
  ApiV1SearchRequestDto,
  ApiV1SearchResponseDto,
  ApiV1SearchResultDto,
} from "./schemas/search.ts";
export type {
  ApiV1AuditEntryDto,
  ApiV1AuditPageDto,
  ApiV1CreateTokenRequestDto,
  ApiV1CreatedTokenDto,
  ApiV1TokenDto,
} from "./schemas/admin.ts";
