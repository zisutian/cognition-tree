// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiAccessAdministration,
  AutomationApiToken,
  AutomationApiScope,
  CreateAutomationApiTokenRequest,
} from "../../../application/apiAccess/apiAccessAdministration";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import {
  parseApiCreatedToken,
  parseApiTokenList,
} from "../../../contracts/api/parse";
import {
  AgentOperationAuditPageSchema,
} from "../../../contracts/agent/schemas";
import { parseAgentSchema } from "../../../contracts/agent/parse";
import {
  requestApiJson,
  type HttpApiTransportOptions,
} from "./apiTransport";

function projectToken(
  token: ReturnType<typeof parseApiTokenList>[number],
): AutomationApiToken {
  return {
    ...token,
    scopes: token.scopes as AutomationApiScope[],
  };
}

export function createHttpApiAdministration({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions): ApiAccessAdministration {
  return {
    async createToken(request: CreateAutomationApiTokenRequest) {
      const created = parseApiCreatedToken(
        await requestApiJson(
          fetchFn,
          baseUrl,
          "/api/v3/admin/automation-tokens",
          {
            body: serializeJsonIteratively(request),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
          token,
        ),
      );

      return { secret: created.secret, token: projectToken(created.token) };
    },
    async listAgentOperations(cursor: string | null = null) {
      const query = new URLSearchParams({ limit: "50" });

      if (cursor) query.set("cursor", cursor);
      const page = parseAgentSchema(
        AgentOperationAuditPageSchema,
        await requestApiJson(
          fetchFn,
          baseUrl,
          `/api/v3/admin/agent-operations?${query}`,
          undefined,
          token,
        ),
      );

      return {
        cursor: page.cursor,
        entries: page.entries.map((entry) => ({
          afterRevision: entry.afterRevision as `sha256:${string}` | null,
          approvingOwnerId: entry.approvingOwnerId,
          beforeRevision: entry.beforeRevision as `sha256:${string}`,
          blockIds: entry.changeMetadata.blockIds,
          digest: entry.digest as `sha256:${string}`,
          occurredAt: entry.occurredAt,
          profileId: entry.profileId,
          proposalId: entry.proposalId,
          proposalVersion: entry.proposalVersion,
          resourceIds: entry.changeMetadata.resourceIds,
          result: entry.result,
          runtimeKind: entry.runtimeKind,
          sessionId: entry.sessionId,
          store: entry.store,
        })),
      };
    },
    async listTokens() {
      return parseApiTokenList(
        await requestApiJson(
          fetchFn,
          baseUrl,
          "/api/v3/admin/automation-tokens",
          undefined,
          token,
        ),
      ).map(projectToken);
    },
    async revokeToken(tokenId) {
      await requestApiJson(
        fetchFn,
        baseUrl,
        `/api/v3/admin/automation-tokens/${encodeURIComponent(tokenId)}`,
        { method: "DELETE" },
        token,
      );
    },
  };
}
