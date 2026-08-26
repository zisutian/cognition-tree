// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OperationAdministration,
  OperationAuditEntry,
} from "../../../application/operations/operationAdministration.ts";
import {
  ApiOperationAuditPageSchema,
  ApiOperationAuditStatusSchema,
} from "../../../contracts/api/schemas/operations.ts";
import { parseApiSchema } from "../../../contracts/api/parse.ts";
import {
  requestApiJson,
  type HttpApiTransportOptions,
} from "./apiTransport.ts";

function projectEntry(
  entry: ReturnType<typeof parsePage>["entries"][number],
): OperationAuditEntry {
  const common = {
    afterRevision: entry.afterRevision as `sha256:${string}` | null,
    beforeRevision: entry.beforeRevision as `sha256:${string}`,
    blockIds: entry.changeMetadata.blockIds,
    id: entry.id,
    occurredAt: entry.occurredAt,
    principalId: entry.principalId,
    requestId: entry.requestId,
    resourceIds: entry.changeMetadata.resourceIds,
    result: entry.result,
    route: entry.route,
    store: entry.store,
    updatedAt: entry.updatedAt,
  };

  return entry.source === "agent"
    ? {
        ...common,
        source: "agent",
        technical: {
          digest: entry.agent.digest as `sha256:${string}`,
          profileId: entry.agent.profileId,
          profileVersion: entry.agent.profileVersion,
          proposalId: entry.agent.proposalId,
          proposalVersion: entry.agent.proposalVersion,
          providerId: entry.agent.providerId,
          providerVersion: entry.agent.providerVersion,
          runtimeKind: entry.agent.runtimeKind,
          sessionId: entry.agent.sessionId,
        },
      }
    : {
        ...common,
        source: "trusted-client",
        technical: {
          intentDigest: entry.intentDigest as `sha256:${string}`,
        },
      };
}

function parsePage(value: unknown) {
  return parseApiSchema(ApiOperationAuditPageSchema, value);
}

export function createHttpOperationAdministration({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions): OperationAdministration {
  return {
    async getStatus() {
      return parseApiSchema(
        ApiOperationAuditStatusSchema,
        await requestApiJson(
          fetchFn,
          baseUrl,
          "/api/v3/admin/operations/status",
          undefined,
          token,
        ),
      );
    },
    async list(cursor: string | null = null) {
      const query = new URLSearchParams({ limit: "50" });

      if (cursor) query.set("cursor", cursor);
      const page = parsePage(await requestApiJson(
        fetchFn,
        baseUrl,
        `/api/v3/admin/operations?${query}`,
        undefined,
        token,
      ));

      return {
        cursor: page.cursor,
        entries: page.entries.map(projectEntry),
      };
    },
  };
}
