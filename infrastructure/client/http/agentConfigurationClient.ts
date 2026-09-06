import { buildApiOperationPath } from "../../../contracts/api/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  AgentCodexDeviceLoginStatus,
  AgentConformanceCheckStatus,
  AgentConfigurationPort,
  AgentConfigurationSnapshot,
} from "../../../application/agent/index.ts";
import {
  AgentConfigurationSnapshotSchema,
  AgentCodexDeviceLoginStatusSchema,
  AgentConformanceCheckStatusSchema,
  AgentOllamaDiscoveryResultSchema,
  AgentProviderProbeResultSchema,
  parseAgentSchema,
} from "../../../contracts/agent/index.ts";

import { serializeJsonIteratively } from "../../../contracts/common/index.ts";
import {
  requestApiJson,
  type HttpApiTransportOptions,
} from "./apiTransport.ts";

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

function codexDeviceLogin(value: unknown) {
  return parseAgentSchema(
    AgentCodexDeviceLoginStatusSchema,
    value,
  ) as AgentCodexDeviceLoginStatus;
}

export function createHttpAgentConfigurationClient({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions): AgentConfigurationPort {
  const request = (endpoint: string, init?: RequestInit) =>
    requestApiJson(fetchFn, baseUrl, endpoint, init, token);

  return {
    async cancelCodexDeviceLogin(loginId) {
      return codexDeviceLogin(await request(
        buildApiOperationPath("getAgentCodexDeviceLogin", { codexLoginId: loginId }),
        { method: "DELETE" },
      ));
    },
    async cancelConformance(checkId) {
      return conformanceCheck(await request(
        buildApiOperationPath("getAgentProfileConformanceCheck", { conformanceCheckId: checkId }),
        { method: "DELETE" },
      ));
    },
    async clearProviderAuthentication(baseRevision, providerId) {
      return configuration(await request(
        buildApiOperationPath("clearAgentProviderAuthentication", { providerId: providerId }),
        jsonRequest({ baseRevision }, "DELETE"),
      ));
    },
    async getConformance(checkId) {
      return conformanceCheck(await request(
        buildApiOperationPath("getAgentProfileConformanceCheck", { conformanceCheckId: checkId }),
      ));
    },
    async getCodexDeviceLogin(loginId) {
      return codexDeviceLogin(await request(
        buildApiOperationPath("getAgentCodexDeviceLogin", { codexLoginId: loginId }),
      ));
    },
    async startConformance(baseRevision, profileId) {
      return conformanceCheck(await request(
        buildApiOperationPath("startAgentProfileConformanceCheck", { profileId: profileId }),
        jsonRequest({ baseRevision }, "POST"),
      ));
    },
    async startCodexDeviceLogin(baseRevision, providerId) {
      return codexDeviceLogin(await request(
        buildApiOperationPath("startAgentCodexDeviceLogin", { providerId: providerId }),
        jsonRequest({ baseRevision }, "POST"),
      ));
    },
    async createProfile(baseRevision, profile) {
      return configuration(await request(
        buildApiOperationPath("createAgentProfile"),
        jsonRequest({ baseRevision, profile }, "POST"),
      ));
    },
    async createProvider(baseRevision, provider) {
      return configuration(await request(
        buildApiOperationPath("createAgentProvider"),
        jsonRequest({ baseRevision, provider }, "POST"),
      ));
    },
    async deleteProfile(baseRevision, profileId) {
      return configuration(await request(
        buildApiOperationPath("updateAgentProfile", { profileId: profileId }),
        jsonRequest({ baseRevision }, "DELETE"),
      ));
    },
    async deleteProvider(baseRevision, providerId) {
      return configuration(await request(
        buildApiOperationPath("updateAgentProvider", { providerId: providerId }),
        jsonRequest({ baseRevision }, "DELETE"),
      ));
    },
    async discoverOllama(endpoint) {
      return parseAgentSchema(
        AgentOllamaDiscoveryResultSchema,
        await request(
          buildApiOperationPath("discoverOllamaProvider"),
          jsonRequest({ endpoint }, "POST"),
        ),
      );
    },
    async load() {
      return configuration(await request(
        buildApiOperationPath("getAgentConfiguration"),
      ));
    },
    async probeProvider(providerId) {
      return parseAgentSchema(
        AgentProviderProbeResultSchema,
        await request(
          buildApiOperationPath("probeAgentProvider", { providerId: providerId }),
          { method: "POST" },
        ),
      );
    },
    async updateProfile(baseRevision, profileId, profile) {
      return configuration(await request(
        buildApiOperationPath("updateAgentProfile", { profileId: profileId }),
        jsonRequest({ baseRevision, profile }, "PATCH"),
      ));
    },
    async updateProvider(baseRevision, providerId, provider) {
      return configuration(await request(
        buildApiOperationPath("updateAgentProvider", { providerId: providerId }),
        jsonRequest({ baseRevision, provider }, "PATCH"),
      ));
    },
  };
}
