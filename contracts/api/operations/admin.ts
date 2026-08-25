// SPDX-License-Identifier: GPL-3.0-or-later

import { Type } from "@sinclair/typebox";
import { AgentOperationAuditPageSchema } from "../../agent/schemas.ts";
import {
  AgentConfigurationDeleteRequestSchema,
  AgentConfigurationSnapshotSchema,
  AgentConformanceCheckRequestSchema,
  AgentOllamaDiscoveryRequestSchema,
  AgentOllamaDiscoveryResultSchema,
  AgentProfileMutationRequestSchema,
  AgentProviderProbeResultSchema,
  AgentProviderMutationRequestSchema,
} from "../../agent/configurationSchemas.ts";
import { parseCreateRepository, parseRenameRepository } from "../../workspace/parseCatalog.ts";
import { parseApiCreateTokenRequest } from "../parse.ts";
import { ApiCreateTokenRequestSchema, ApiCreatedTokenSchema, ApiRevokedSchema, ApiTokenListSchema } from "../schemas/admin.ts";
import {
  ApiDataRootMigrationRequestSchema,
  ApiDataRootMigrationStatusSchema,
  ApiOwnerCredentialRotationSchema,
  ApiSystemConfigurationMutationSchema,
  ApiSystemConfigurationRevisionSchema,
  ApiSystemConfigurationSnapshotSchema,
} from "../schemas/system.ts";
import {
  ApiBuiltInCatalogSchema,
  ApiBuiltInRetryResultSchema,
  ApiCreateRepositorySchema,
  ApiRenameRepositorySchema,
  ApiRepositoryCatalogSchema,
  ApiRepositoryDescriptorSchema,
} from "../schemas/storage.ts";
import { apiBody, ownerAccess, type ApiOperationDefinition } from "./definition.ts";

const auditQuerySchema = Type.Object({
  cursor: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
}, { additionalProperties: false });

export const adminApiOperations = [
  { access: ownerAccess(), method: "GET", operationId: "getSystemConfiguration", path: "/api/v3/admin/system-configuration", responses: { 200: ApiSystemConfigurationSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(ApiSystemConfigurationMutationSchema), method: "PATCH", operationId: "updateSystemConfiguration", path: "/api/v3/admin/system-configuration", responses: { 200: ApiSystemConfigurationSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(ApiSystemConfigurationRevisionSchema), method: "POST", operationId: "rotateOwnerCredential", path: "/api/v3/admin/system-configuration/owner-credential", responses: { 200: ApiOwnerCredentialRotationSchema } },
  { access: ownerAccess(), body: apiBody(ApiSystemConfigurationRevisionSchema), method: "DELETE", operationId: "clearOwnerCredential", path: "/api/v3/admin/system-configuration/owner-credential", responses: { 200: ApiSystemConfigurationSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(ApiDataRootMigrationRequestSchema), method: "POST", operationId: "createDataRootMigration", path: "/api/v3/admin/data-root-migrations", responses: { 202: ApiDataRootMigrationStatusSchema } },
  { access: ownerAccess(), method: "GET", operationId: "getDataRootMigration", path: "/api/v3/admin/data-root-migrations/{migrationId}", responses: { 200: ApiDataRootMigrationStatusSchema } },
  { access: ownerAccess(), method: "GET", operationId: "getAgentConfiguration", path: "/api/v3/admin/agent-configuration", responses: { 200: AgentConfigurationSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(AgentProviderMutationRequestSchema), method: "POST", operationId: "createAgentProvider", path: "/api/v3/admin/agent-providers", responses: { 201: AgentConfigurationSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(AgentOllamaDiscoveryRequestSchema), method: "POST", operationId: "discoverOllamaProvider", path: "/api/v3/admin/agent-providers/discover-ollama", responses: { 200: AgentOllamaDiscoveryResultSchema } },
  { access: ownerAccess(), body: apiBody(AgentProviderMutationRequestSchema), method: "PATCH", operationId: "updateAgentProvider", path: "/api/v3/admin/agent-providers/{providerId}", responses: { 200: AgentConfigurationSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(AgentConfigurationDeleteRequestSchema), method: "DELETE", operationId: "deleteAgentProvider", path: "/api/v3/admin/agent-providers/{providerId}", responses: { 200: AgentConfigurationSnapshotSchema } },
  { access: ownerAccess(), method: "POST", operationId: "probeAgentProvider", path: "/api/v3/admin/agent-providers/{providerId}/probe", responses: { 200: AgentProviderProbeResultSchema } },
  { access: ownerAccess(), body: apiBody(AgentProfileMutationRequestSchema), method: "POST", operationId: "createAgentProfile", path: "/api/v3/admin/agent-profiles", responses: { 201: AgentConfigurationSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(AgentProfileMutationRequestSchema), method: "PATCH", operationId: "updateAgentProfile", path: "/api/v3/admin/agent-profiles/{profileId}", responses: { 200: AgentConfigurationSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(AgentConfigurationDeleteRequestSchema), method: "DELETE", operationId: "deleteAgentProfile", path: "/api/v3/admin/agent-profiles/{profileId}", responses: { 200: AgentConfigurationSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(AgentConformanceCheckRequestSchema), method: "POST", operationId: "checkAgentProfileConformance", path: "/api/v3/admin/agent-profiles/{profileId}/conformance-check", responses: { 200: AgentConfigurationSnapshotSchema } },
  { access: ownerAccess(), method: "GET", operationId: "listAdminRepositories", path: "/api/v3/admin/repositories", responses: { 200: ApiRepositoryCatalogSchema } },
  { access: ownerAccess(), body: apiBody(ApiCreateRepositorySchema, parseCreateRepository), method: "POST", operationId: "createAdminRepository", path: "/api/v3/admin/repositories", responses: { 201: ApiRepositoryDescriptorSchema } },
  { access: ownerAccess(), body: apiBody(ApiRenameRepositorySchema, parseRenameRepository), method: "PATCH", operationId: "renameAdminRepository", path: "/api/v3/admin/repositories/{repositoryId}", responses: { 200: ApiRepositoryDescriptorSchema } },
  { access: ownerAccess(), method: "DELETE", operationId: "deleteAdminRepository", path: "/api/v3/admin/repositories/{repositoryId}", responses: { 204: null } },
  { access: ownerAccess(), method: "GET", operationId: "listBuiltIns", path: "/api/v3/admin/built-ins", responses: { 200: ApiBuiltInCatalogSchema } },
  { access: ownerAccess(), method: "POST", operationId: "retryBuiltIn", path: "/api/v3/admin/built-ins/{builtInId}/retry", responses: { 200: ApiBuiltInRetryResultSchema } },
  { access: ownerAccess(), method: "GET", operationId: "listApiTokens", path: "/api/v3/admin/automation-tokens", responses: { 200: ApiTokenListSchema } },
  { access: ownerAccess(), body: apiBody(ApiCreateTokenRequestSchema, parseApiCreateTokenRequest), method: "POST", operationId: "createApiToken", path: "/api/v3/admin/automation-tokens", responses: { 201: ApiCreatedTokenSchema } },
  { access: ownerAccess(), method: "DELETE", operationId: "revokeToken", path: "/api/v3/admin/automation-tokens/{tokenId}", responses: { 200: ApiRevokedSchema } },
  { access: ownerAccess(), method: "GET", operationId: "listAgentOperations", path: "/api/v3/admin/agent-operations", query: auditQuerySchema, responses: { 200: AgentOperationAuditPageSchema } },
] as const satisfies readonly ApiOperationDefinition[];
