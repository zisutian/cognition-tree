// SPDX-License-Identifier: GPL-3.0-or-later

export { ContentTargetError, resolveNamedContent } from "./targetResolution.ts";
export type { NamedContentResource } from "./targetResolution.ts";

export { queryContent, contentCatalogRevision } from "./contentQuery.ts";
export type { ContentQuery, ContentQueryResult } from "./contentQuery.ts";
export type {
  ContentScope,
  ContentReadBasis,
  ContentCatalogSession,
  ContentServicePorts,
  ContentRevision,
  ContentWorkspaceStore,
  ContentJournalStore,
  ContentTodoStore,
} from "./contentPorts.ts";
export { ContentService } from "./contentService.ts";
export {
  readWorkspaceTreeResource,
  readWorkspaceNoteResource,
} from "./workspaceResources.ts";
export type {
  WorkspaceTreeNodeResource,
  WorkspaceTreeResource,
} from "./workspaceResources.ts";
export {
  readJournalEntriesResource,
  readJournalEntryResource,
  projectJournalEntryResource,
} from "./journalResources.ts";
export type {
  JournalEntriesResource,
  JournalEntrySummaryResource,
} from "./journalResources.ts";
export {
  readTodoCollectionsResource,
  readTodoCollectionResource,
  projectTodoCollectionResource,
  projectTodoCollectionDocument,
} from "./todoResources.ts";
export type {
  TodoCollectionsResource,
  TodoCollectionResource,
  TodoCollectionSummaryResource,
} from "./todoResources.ts";
export type {
  ContentCommand,
  ContentOperationRequest,
} from "./contentCommand.ts";
