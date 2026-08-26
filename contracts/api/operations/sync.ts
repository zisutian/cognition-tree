// SPDX-License-Identifier: GPL-3.0-or-later

import { parseJournalSyncRequest } from "../../journal/parseJournal.ts";
import { parseTodoSyncRequest } from "../../todo/parseTodo.ts";
import { parseWorkspaceRepositorySyncRequest } from "../../workspace/parseRepository.ts";
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
  { access: syncAccess(), method: "GET", operationId: "getWorkspaceSyncSnapshot", path: "/api/v3/sync/workspaces/{repositoryId}", responses: { 200: ApiWorkspaceSnapshotSchema } },
  { access: syncAccess(), body: apiBody(ApiWorkspaceSyncRequestSchema, parseWorkspaceRepositorySyncRequest), method: "PUT", operationId: "putWorkspaceSyncSnapshot", path: "/api/v3/sync/workspaces/{repositoryId}", responses: { 200: ApiWorkspaceSyncResultSchema } },
  { access: syncAccess(), method: "GET", operationId: "getJournalSyncSnapshot", path: "/api/v3/sync/journal", responses: { 200: ApiJournalSnapshotSchema } },
  { access: syncAccess(), body: apiBody(ApiJournalSyncRequestSchema, parseJournalSyncRequest), method: "PUT", operationId: "putJournalSyncSnapshot", path: "/api/v3/sync/journal", responses: { 200: ApiJournalSyncResultSchema } },
  { access: syncAccess(), method: "GET", operationId: "getTodoSyncSnapshot", path: "/api/v3/sync/todo", responses: { 200: ApiTodoSnapshotSchema } },
  { access: syncAccess(), body: apiBody(ApiTodoSyncRequestSchema, parseTodoSyncRequest), method: "PUT", operationId: "putTodoSyncSnapshot", path: "/api/v3/sync/todo", responses: { 200: ApiTodoSyncResultSchema } },
] as const satisfies readonly ApiOperationDefinition[];
