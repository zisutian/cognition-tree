// SPDX-License-Identifier: GPL-3.0-or-later

export {
  apiAllowedMethods,
  assertApiOperationResponse,
  buildApiOperationPath,
  getApiOperation,
  getApiRouteOperation,
  parseApiOperationQuery,
  parseApiOperationRequest,
  parseApiOperationResponse,
  resolveApiRoute,
} from "./registry.ts";
export {
  apiAutomationScopes,
} from "./types.ts";
export type {
  ApiChangeEventDto,
  ApiCheckpointEventDto,
  ApiCreatedTokenDto,
  ApiCreatedTrustedClientTokenDto,
  ApiCreateTokenRequestDto,
  ApiCreateTrustedClientTokenRequestDto,
  ApiCtnBlockDto,
  ApiCtnDocumentDto,
  ApiErrorCodeDto,
  ApiErrorDto,
  ApiJournalEntriesDto,
  ApiJournalEntrySummaryDto,
  ApiPrincipalDto,
  ApiResourceVersionDto,
  ApiRevisionCheckpointDto,
  ApiSearchRequestDto,
  ApiSearchResponseDto,
  ApiSyntaxGuideDto,
  ApiTodoCollectionDto,
  ApiTodoCollectionsDto,
  ApiTodoItemStateDto,
  ApiTokenDto,
  ApiTrustedClientTokenDto,
  ApiWorkspaceTreeDto,
  ApiWorkspaceTreeNodeDto,
  AutomationApiScope,
} from "./types.ts";
export {
  ApiCreatedTrustedClientTokenSchema,
  ApiTrustedClientTokenListSchema,
} from "./schemas/admin.ts";
export type {
  ApiDataRootMigrationRequestDto,
  ApiOwnerCredentialRotationActivationDto,
  ApiOwnerSessionRequestDto,
  ApiSystemConfigurationMutationDto,
  ApiSystemConfigurationRevisionDto,
} from "./schemas/system.ts";
export {
  ApiDataRootMigrationStatusSchema,
  ApiOwnerCredentialRotationPreparationSchema,
  ApiOwnerSessionSchema,
  ApiSystemConfigurationSnapshotSchema,
} from "./schemas/system.ts";
export {
  ApiErrorCatalog,
} from "./errorPolicy.ts";
export type {
  ApiOperationAuditEntryDto,
  ApiOperationAuditPageDto,
} from "./schemas/operations.ts";
export {
  ApiOperationAuditEntrySchema,
  ApiOperationAuditPageSchema,
  ApiOperationAuditStatusSchema,
} from "./schemas/operations.ts";
export type {
  ApiOperationDefinition,
  ResolvedApiRoute,
} from "./registry.ts";
export {
  createApiOpenApiDocument,
} from "./openApi.ts";
export {
  parseApiCreatedToken,
  parseApiEvent,
  parseApiSchema,
  parseApiTokenList,
} from "./parse.ts";
export {
  parseApiError,
} from "./parseError.ts";
export {
  RecoveryBootstrapRequestSchema,
} from "./operations/recovery.ts";
