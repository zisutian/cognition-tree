// SPDX-License-Identifier: GPL-3.0-or-later

import { parseApiSearchRequest } from "../parse.ts";
import { ApiEventSchema } from "../schemas/events.ts";
import {
  ApiCtnDocumentSchema,
  ApiJournalEntriesSchema,
  ApiTodoCollectionSchema,
  ApiTodoCollectionsSchema,
  ApiWorkspaceListSchema,
  ApiWorkspaceTreeSchema,
} from "../schemas/resources.ts";
import { ApiSearchRequestSchema, ApiSearchResponseSchema } from "../schemas/search.ts";
import { apiBody, readableAccess, type ApiOperationDefinition } from "./definition.ts";

export const contentApiOperations = [
  { access: readableAccess("any"), method: "GET", operationId: "streamContentEvents", path: "/api/v3/content/events", responseMediaType: "text/event-stream", responses: { 200: ApiEventSchema } },
  { access: readableAccess("any"), body: apiBody(ApiSearchRequestSchema, parseApiSearchRequest), method: "POST", operationId: "searchContent", path: "/api/v3/content/search", responses: { 200: ApiSearchResponseSchema } },
  { access: readableAccess("workspace"), method: "GET", operationId: "listWorkspaces", path: "/api/v3/content/workspaces", responses: { 200: ApiWorkspaceListSchema } },
  { access: readableAccess("workspace"), method: "GET", operationId: "getWorkspaceTree", path: "/api/v3/content/workspaces/{repositoryId}/tree", responses: { 200: ApiWorkspaceTreeSchema } },
  { access: readableAccess("workspace"), method: "GET", operationId: "getWorkspaceNote", path: "/api/v3/content/workspaces/{repositoryId}/notes/{noteId}", responses: { 200: ApiCtnDocumentSchema } },
  { access: readableAccess("journal"), method: "GET", operationId: "listJournalEntries", path: "/api/v3/content/journal/entries", responses: { 200: ApiJournalEntriesSchema } },
  { access: readableAccess("journal"), method: "GET", operationId: "getJournalEntry", path: "/api/v3/content/journal/entries/{entryId}", responses: { 200: ApiCtnDocumentSchema } },
  { access: readableAccess("todo"), method: "GET", operationId: "listTodoCollections", path: "/api/v3/content/todo/collections", responses: { 200: ApiTodoCollectionsSchema } },
  { access: readableAccess("todo"), method: "GET", operationId: "getTodoCollection", path: "/api/v3/content/todo/collections/{collectionId}", responses: { 200: ApiTodoCollectionSchema } },
] as const satisfies readonly ApiOperationDefinition[];
