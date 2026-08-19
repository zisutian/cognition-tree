// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { apiV1Operations } from "../../contracts/api/registry.ts";

const expectedCapabilities = [
  ["GET", "getHealth"],
  ["GET", "getCapabilities"],
  ["GET", "getOpenApi"],
  ["GET", "streamEvents"],
  ["POST", "searchContent"],
  ["GET", "listWorkspaces"],
  ["GET", "getWorkspaceTree"],
  ["GET", "getWorkspaceNote"],
  ["POST", "executeWorkspaceCommand"],
  ["GET", "listJournalEntries"],
  ["GET", "getJournalEntry"],
  ["POST", "executeJournalCommand"],
  ["GET", "listTodoCollections"],
  ["GET", "getTodoCollection"],
  ["POST", "executeTodoCommand"],
  ["GET", "getWorkspaceSyncSnapshot"],
  ["PUT", "putWorkspaceSyncSnapshot"],
  ["GET", "getJournalSyncSnapshot"],
  ["PUT", "putJournalSyncSnapshot"],
  ["GET", "getTodoSyncSnapshot"],
  ["PUT", "putTodoSyncSnapshot"],
  ["GET", "listAdminRepositories"],
  ["POST", "createAdminRepository"],
  ["PATCH", "renameAdminRepository"],
  ["DELETE", "deleteAdminRepository"],
  ["GET", "listBuiltIns"],
  ["POST", "retryBuiltIn"],
  ["GET", "listApiTokens"],
  ["POST", "createApiToken"],
  ["DELETE", "revokeToken"],
  ["GET", "listAuditEntries"],
] as const;

describe("HTTP API capability matrix", () => {
  it("keeps every supported operation under one authoritative catalog", () => {
    expect(
      apiV1Operations.map(({ method, operationId }) => [method, operationId]),
    ).toEqual(expectedCapabilities);
    expect(new Set(apiV1Operations.map(({ operationId }) => operationId)).size)
      .toBe(expectedCapabilities.length);
  });
});
