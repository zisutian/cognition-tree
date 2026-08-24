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
  ApiBuiltInCatalogSchema,
  ApiBuiltInRetryResultSchema,
  ApiCreateRepositorySchema,
  ApiRenameRepositorySchema,
  ApiRepositoryCatalogSchema,
  ApiRepositoryDeletionResultSchema,
  ApiRepositoryDescriptorSchema,
} from "../schemas/storage.ts";
import { apiBody, ownerAccess, type ApiOperationDefinition } from "./definition.ts";

const repositoryDeleteQuerySchema = Type.Object({
  mode: Type.Union([Type.Literal("delete-managed-data"), Type.Literal("remove-connection")]),
}, { additionalProperties: false });
const auditQuerySchema = Type.Object({
  cursor: Type.Optional(Type.Integer({ minimum: 0 })),
  limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
}, { additionalProperties: false });

export const adminApiOperations = [
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
  { access: ownerAccess(), method: "DELETE", operationId: "deleteAdminRepository", path: "/api/v3/admin/repositories/{repositoryId}", query: repositoryDeleteQuerySchema, responses: { 200: ApiRepositoryDeletionResultSchema, 202: ApiRepositoryDeletionResultSchema } },
  { access: ownerAccess(), method: "GET", operationId: "listBuiltIns", path: "/api/v3/admin/built-ins", responses: { 200: ApiBuiltInCatalogSchema } },
  { access: ownerAccess(), method: "POST", operationId: "retryBuiltIn", path: "/api/v3/admin/built-ins/{builtInId}/retry", responses: { 200: ApiBuiltInRetryResultSchema } },
  { access: ownerAccess(), method: "GET", operationId: "listApiTokens", path: "/api/v3/admin/automation-tokens", responses: { 200: ApiTokenListSchema } },
  { access: ownerAccess(), body: apiBody(ApiCreateTokenRequestSchema, parseApiCreateTokenRequest), method: "POST", operationId: "createApiToken", path: "/api/v3/admin/automation-tokens", responses: { 201: ApiCreatedTokenSchema } },
  { access: ownerAccess(), method: "DELETE", operationId: "revokeToken", path: "/api/v3/admin/automation-tokens/{tokenId}", responses: { 200: ApiRevokedSchema } },
  { access: ownerAccess(), method: "GET", operationId: "listAgentOperations", path: "/api/v3/admin/agent-operations", query: auditQuerySchema, responses: { 200: AgentOperationAuditPageSchema } },
] as const satisfies readonly ApiOperationDefinition[];
