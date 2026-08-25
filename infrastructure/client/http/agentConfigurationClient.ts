// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentConformanceCheckStatus,
  AgentConfigurationPort,
  AgentConfigurationSnapshot,
} from "../../../application/agent";
import {
  AgentConfigurationSnapshotSchema,
  AgentConformanceCheckStatusSchema,
  AgentOllamaDiscoveryResultSchema,
  AgentProviderProbeResultSchema,
} from "../../../contracts/agent/configurationSchemas";
import { parseAgentSchema } from "../../../contracts/agent/parse";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import {
  requestApiJson,
  type HttpApiTransportOptions,
} from "./apiTransport";

function jsonRequest(body: unknown, method: "DELETE" | "PATCH" | "POST") {
  return {
    body: serializeJsonIteratively(body),
    headers: { "Content-Type": "application/json" },
    method,
  } satisfies RequestInit;
}

function configuration(value: unknown) {
  return parseAgentSchema(
    AgentConfigurationSnapshotSchema,
    value,
  ) as AgentConfigurationSnapshot;
}

function conformanceCheck(value: unknown) {
  return parseAgentSchema(
    AgentConformanceCheckStatusSchema,
    value,
  ) as AgentConformanceCheckStatus;
}

export function createHttpAgentConfigurationClient({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions): AgentConfigurationPort {
  const request = (endpoint: string, init?: RequestInit) =>
    requestApiJson(fetchFn, baseUrl, endpoint, init, token);

  return {
    async cancelConformance(checkId) {
      return conformanceCheck(await request(
        `/api/v3/admin/agent-conformance-checks/${encodeURIComponent(checkId)}`,
        { method: "DELETE" },
      ));
    },
    async getConformance(checkId) {
      return conformanceCheck(await request(
        `/api/v3/admin/agent-conformance-checks/${encodeURIComponent(checkId)}`,
      ));
    },
    async startConformance(baseRevision, profileId) {
      return conformanceCheck(await request(
        `/api/v3/admin/agent-profiles/${encodeURIComponent(profileId)}/conformance-checks`,
        jsonRequest({ baseRevision }, "POST"),
      ));
    },
    async createProfile(baseRevision, profile) {
      return configuration(await request(
        "/api/v3/admin/agent-profiles",
        jsonRequest({ baseRevision, profile }, "POST"),
      ));
    },
    async createProvider(baseRevision, provider) {
      return configuration(await request(
        "/api/v3/admin/agent-providers",
        jsonRequest({ baseRevision, provider }, "POST"),
      ));
    },
    async deleteProfile(baseRevision, profileId) {
      return configuration(await request(
        `/api/v3/admin/agent-profiles/${encodeURIComponent(profileId)}`,
        jsonRequest({ baseRevision }, "DELETE"),
      ));
    },
    async deleteProvider(baseRevision, providerId) {
      return configuration(await request(
        `/api/v3/admin/agent-providers/${encodeURIComponent(providerId)}`,
        jsonRequest({ baseRevision }, "DELETE"),
      ));
    },
    async discoverOllama(endpoint) {
      return parseAgentSchema(
        AgentOllamaDiscoveryResultSchema,
        await request(
          "/api/v3/admin/agent-providers/discover-ollama",
          jsonRequest({ endpoint }, "POST"),
        ),
      );
    },
    async load() {
      return configuration(await request(
        "/api/v3/admin/agent-configuration",
      ));
    },
    async probeProvider(providerId) {
      return parseAgentSchema(
        AgentProviderProbeResultSchema,
        await request(
          `/api/v3/admin/agent-providers/${encodeURIComponent(providerId)}/probe`,
          { method: "POST" },
        ),
      );
    },
    async updateProfile(baseRevision, profileId, profile) {
      return configuration(await request(
        `/api/v3/admin/agent-profiles/${encodeURIComponent(profileId)}`,
        jsonRequest({ baseRevision, profile }, "PATCH"),
      ));
    },
    async updateProvider(baseRevision, providerId, provider) {
      return configuration(await request(
        `/api/v3/admin/agent-providers/${encodeURIComponent(providerId)}`,
        jsonRequest({ baseRevision, provider }, "PATCH"),
      ));
    },
  };
}
