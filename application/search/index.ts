// SPDX-License-Identifier: GPL-3.0-or-later

export {
  createCtnSearchDocument,
} from "./searchDocuments.ts";
export {
  createSearchController,
  searchDraftsEqual,
} from "./searchController.ts";
export {
  createSearchQuery,
} from "./searchIndex.ts";
export {
  ScopedSearchService,
  SearchAccessError,
} from "./scopedSearch.ts";
export type {
  SearchAccess,
  SearchCatalogPort,
} from "./scopedSearch.ts";
export type {
  SearchController,
  SearchControllerState,
  SearchControllerView,
} from "./searchController.ts";
export type {
  SearchDocument,
  SearchDomain,
  SearchFault,
  SearchQuery,
  SearchRequest,
  SearchResourceVersion,
  SearchResponse,
  SearchResult,
  SearchSource,
} from "./searchTypes.ts";
export {
  searchDomains,
  SearchRequestError,
} from "./searchTypes.ts";
