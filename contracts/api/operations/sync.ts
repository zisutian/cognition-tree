// SPDX-License-Identifier: GPL-3.0-or-later

import { parseJournalSyncRequest } from "../../journal/index.ts";
import { parseTodoSyncRequest } from "../../todo/index.ts";
import { parseWorkspaceRepositorySyncRequest } from "../../workspace/index.ts";
import {
  ApiJournalSnapshotSchema,
  ApiJournalSyncRequestSchema,
  ApiJournalSyncResultSchema,
  ApiTodoSnapshotSchema,
  ApiTodoSyncRequestSchema,
  ApiTodoSyncResultSchema,
  ApiWorkspaceSnapshotSchema,
  ApiWorkspaceSyncRequestSchema,
  ApiWorkspaceSyncResultSchema,
} from "../schemas/storage.ts";
import { apiBody, syncAccess, type ApiOperationDefinition } from "./definition.ts";

export const syncApiOperations = [
  { access: syncAccess(), method: "GET", operationId: "getWorkspaceSyncSnapshot", path: "/api/v4/sync/workspaces/{repositoryId}", responses: { 200: ApiWorkspaceSnapshotSchema } },
  { access: syncAccess(), body: apiBody(ApiWorkspaceSyncRequestSchema, parseWorkspaceRepositorySyncRequest), maximumBodyBytes: 42 * 1024 * 1024, method: "PUT", operationId: "putWorkspaceSyncSnapshot", path: "/api/v4/sync/workspaces/{repositoryId}", responses: { 200: ApiWorkspaceSyncResultSchema } },
  { access: syncAccess(), method: "GET", operationId: "getJournalSyncSnapshot", path: "/api/v4/sync/journal", responses: { 200: ApiJournalSnapshotSchema } },
  { access: syncAccess(), body: apiBody(ApiJournalSyncRequestSchema, parseJournalSyncRequest), maximumBodyBytes: 42 * 1024 * 1024, method: "PUT", operationId: "putJournalSyncSnapshot", path: "/api/v4/sync/journal", responses: { 200: ApiJournalSyncResultSchema } },
  { access: syncAccess(), method: "GET", operationId: "getTodoSyncSnapshot", path: "/api/v4/sync/todo", responses: { 200: ApiTodoSnapshotSchema } },
  { access: syncAccess(), body: apiBody(ApiTodoSyncRequestSchema, parseTodoSyncRequest), maximumBodyBytes: 42 * 1024 * 1024, method: "PUT", operationId: "putTodoSyncSnapshot", path: "/api/v4/sync/todo", responses: { 200: ApiTodoSyncResultSchema } },
] as const satisfies readonly ApiOperationDefinition[];
