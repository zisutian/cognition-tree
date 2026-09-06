import {
  buildApiOperationPath,
  ApiOperationAuditPageSchema,
  ApiOperationAuditStatusSchema,
  parseApiSchema,
} from "../../../contracts/api/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  OperationAdministration,
  OperationAuditEntry,
} from "../../../application/operations/index.ts";


import {
  requestApiJson,
  type HttpApiTransportOptions,
} from "./apiTransport.ts";

function projectEntry(
  entry: ReturnType<typeof parsePage>["entries"][number],
): OperationAuditEntry {
  const common = {
    afterRevision: entry.afterRevision as `sha256:${string}` | null,
    beforeRevision: entry.beforeRevision as `sha256:${string}` | null,
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
          intentDigest: entry.intentDigest as `sha256:${string}` | null,
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
          buildApiOperationPath("getOperationAuditStatus"),
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
        `${buildApiOperationPath("listOperations")}?${query}`,
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
