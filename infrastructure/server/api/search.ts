// SPDX-License-Identifier: GPL-3.0-or-later

import { ScopedSearchService, SearchAccessError, type SearchAccess } from "../../../application/search/scopedSearch.ts";
import { searchDomains, SearchRequestError, type SearchResponse } from "../../../application/search/searchTypes.ts";
import type { ApiPrincipalDto, ApiSearchRequestDto, ApiSearchResponseDto } from "../../../contracts/api/types.ts";
import { ApiRequestError } from "./http/errors.ts";

function projectApiSearchResponse(
  response: SearchResponse,
): ApiSearchResponseDto {
  return {
    cursor: response.cursor,
    faults: response.faults.map((fault) =>
      fault.domain === "workspace"
        ? {
            code: fault.code,
            domain: fault.domain,
            message: fault.message,
            ...(fault.repositoryId
              ? { repositoryId: fault.repositoryId }
              : {}),
          }
        : {
            code: fault.code,
            domain: fault.domain,
            message: fault.message,
          }
    ),
    results: response.results.map((result) => {
      const common = {
        blockId: result.blockId,
        resourceId: result.resourceId,
        snippet: result.snippet,
        title: result.title,
        updatedAt: result.updatedAt,
        version: result.version,
      };

      if (result.domain === "workspace") {
        if (!result.repositoryId) {
          throw new Error("Workspace search result is missing repositoryId.");
        }
        return {
          ...common,
          domain: result.domain,
          repositoryId: result.repositoryId,
        };
      }
      return { ...common, domain: result.domain };
    }),
  };
}


export class ApiSearchService {
  readonly #query: ScopedSearchService;
  constructor(query: ScopedSearchService) { this.#query = query; }
  search(request: ApiSearchRequestDto, principal: ApiPrincipalDto): Promise<ApiSearchResponseDto> {
    const access: SearchAccess = principal.kind === "automation" ? { domains: searchDomains.filter((domain) => principal.scopes.includes(`${domain}:read`)), repositoryIds: principal.repositoryIds } : { domains: searchDomains, repositoryIds: null };
    return this.#search(request, access);
  }
  searchAgent(request: ApiSearchRequestDto) { return this.#search(request, { domains: searchDomains, repositoryIds: null }); }
  async #search(request: ApiSearchRequestDto, access: SearchAccess) {
    try { return projectApiSearchResponse(await this.#query.search(request, access)); }
    catch (error) {
      if (error instanceof SearchAccessError) throw new ApiRequestError("forbidden", error.message);
      if (!(error instanceof SearchRequestError)) throw error;
      if (error.code === "cursor_conflict") throw new ApiRequestError("resource_conflict", error.message, { details: { restartRequired: true } });
      throw new ApiRequestError("invalid_request", error.message);
    }
  }
}
