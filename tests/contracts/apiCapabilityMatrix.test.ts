// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { apiOperations } from "../../contracts/api/registry.ts";

const expectedCapabilities = [
  ["GET", "getHealth"],
  ["GET", "getCapabilities"],
  ["GET", "getOpenApi"],
  ["GET", "getOwnerSession"],
  ["POST", "createOwnerSession"],
  ["DELETE", "deleteOwnerSession"],
  ["GET", "streamContentEvents"],
  ["POST", "searchContent"],
  ["GET", "listWorkspaces"],
  ["GET", "getWorkspaceTree"],
  ["GET", "getWorkspaceNote"],
  ["GET", "listJournalEntries"],
  ["GET", "getJournalEntry"],
  ["GET", "listTodoCollections"],
  ["GET", "getTodoCollection"],
  ["GET", "getWorkspaceSyncSnapshot"],
  ["PUT", "putWorkspaceSyncSnapshot"],
  ["GET", "getJournalSyncSnapshot"],
  ["PUT", "putJournalSyncSnapshot"],
  ["GET", "getTodoSyncSnapshot"],
  ["PUT", "putTodoSyncSnapshot"],
  ["GET", "getAgentStatus"],
  ["GET", "listAgentSessions"],
  ["POST", "createAgentSession"],
  ["GET", "getAgentSession"],
  ["DELETE", "deleteAgentSession"],
  ["POST", "sendAgentMessage"],
  ["POST", "cancelAgentSession"],
  ["GET", "streamAgentEvents"],
  ["POST", "decideAgentProposal"],
  ["POST", "confirmAgentProposalDestruction"],
  ["GET", "getSystemConfiguration"],
  ["PATCH", "updateSystemConfiguration"],
  ["POST", "rotateOwnerCredential"],
  ["DELETE", "clearOwnerCredential"],
  ["POST", "createDataRootMigration"],
  ["GET", "getDataRootMigration"],
  ["GET", "getAgentConfiguration"],
  ["POST", "createAgentProvider"],
  ["POST", "discoverOllamaProvider"],
  ["PATCH", "updateAgentProvider"],
  ["DELETE", "deleteAgentProvider"],
  ["POST", "probeAgentProvider"],
  ["POST", "startAgentCodexDeviceLogin"],
  ["DELETE", "clearAgentProviderAuthentication"],
  ["GET", "getAgentCodexDeviceLogin"],
  ["DELETE", "cancelAgentCodexDeviceLogin"],
  ["POST", "createAgentProfile"],
  ["PATCH", "updateAgentProfile"],
  ["DELETE", "deleteAgentProfile"],
  ["POST", "startAgentProfileConformanceCheck"],
  ["GET", "getAgentProfileConformanceCheck"],
  ["DELETE", "cancelAgentProfileConformanceCheck"],
  ["GET", "listAdminRepositories"],
  ["POST", "createAdminRepository"],
  ["PATCH", "renameAdminRepository"],
  ["DELETE", "deleteAdminRepository"],
  ["GET", "listBuiltIns"],
  ["POST", "retryBuiltIn"],
  ["GET", "listApiTokens"],
  ["POST", "createApiToken"],
  ["DELETE", "revokeToken"],
  ["GET", "listTrustedClientTokens"],
  ["POST", "createTrustedClientToken"],
  ["DELETE", "revokeTrustedClientToken"],
  ["GET", "getOperationAuditStatus"],
  ["GET", "listOperations"],
] as const;

describe("HTTP API capability matrix", () => {
  it("keeps every supported operation under one authoritative catalog", () => {
    expect(
      apiOperations.map(({ method, operationId }) => [method, operationId]),
    ).toEqual(expectedCapabilities);
    expect(new Set(apiOperations.map(({ operationId }) => operationId)).size)
      .toBe(expectedCapabilities.length);
  });
});
