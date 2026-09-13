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
export type {
  ContentCommand,
  ContentOperationRequest,
} from "./contentCommand.ts";
