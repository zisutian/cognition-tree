// SPDX-License-Identifier: GPL-3.0-or-later

import { parseJournalCommit } from "../../journal/parseJournal.ts";
import { parseTodoCommit } from "../../todo/parseTodo.ts";
import { parseWorkspaceRepositoryCommit } from "../../workspace/parseRepository.ts";
import {
  ApiCommitResultSchema,
  ApiJournalCommitSchema,
  ApiJournalSnapshotSchema,
  ApiTodoCommitSchema,
  ApiTodoSnapshotSchema,
  ApiWorkspaceCommitSchema,
  ApiWorkspaceSnapshotSchema,
} from "../schemas/storage.ts";
import { apiBody, ownerAccess, type ApiOperationDefinition } from "./definition.ts";

export const syncApiOperations = [
  { access: ownerAccess(), method: "GET", operationId: "getWorkspaceSyncSnapshot", path: "/api/v3/sync/workspaces/{repositoryId}", responses: { 200: ApiWorkspaceSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(ApiWorkspaceCommitSchema, parseWorkspaceRepositoryCommit), method: "PUT", operationId: "putWorkspaceSyncSnapshot", path: "/api/v3/sync/workspaces/{repositoryId}", responses: { 200: ApiCommitResultSchema } },
  { access: ownerAccess(), method: "GET", operationId: "getJournalSyncSnapshot", path: "/api/v3/sync/journal", responses: { 200: ApiJournalSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(ApiJournalCommitSchema, parseJournalCommit), method: "PUT", operationId: "putJournalSyncSnapshot", path: "/api/v3/sync/journal", responses: { 200: ApiCommitResultSchema } },
  { access: ownerAccess(), method: "GET", operationId: "getTodoSyncSnapshot", path: "/api/v3/sync/todo", responses: { 200: ApiTodoSnapshotSchema } },
  { access: ownerAccess(), body: apiBody(ApiTodoCommitSchema, parseTodoCommit), method: "PUT", operationId: "putTodoSyncSnapshot", path: "/api/v3/sync/todo", responses: { 200: ApiCommitResultSchema } },
] as const satisfies readonly ApiOperationDefinition[];
