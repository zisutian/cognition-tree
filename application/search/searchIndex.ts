// SPDX-License-Identifier: GPL-3.0-or-later

import { decodeSearchCursor, encodeSearchCursor } from "./searchCursor.ts";
import {
  projectSearchDocumentResults,
  sortSearchResults,
  normalizeSearchText,
} from "./searchText.ts";
import {
  searchDomains,
  SearchRequestError,
  SearchSourceError,
  type SearchDocument,
  type SearchFault,
  type SearchQuery,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
  type SearchSource,
  type SearchSourceBatch,
  type SearchSourceProvider,
} from "./searchTypes.ts";

function validateRequest(request: SearchRequest) {
  const normalizedQuery = normalizeSearchText(request.query.trim());

  if (!normalizedQuery) {
    throw new SearchRequestError(
      "invalid_request",
      "Search query must not be empty",
    );
  }
  const limit = request.limit ?? 20;

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new SearchRequestError(
      "invalid_request",
      "Search limit must be between 1 and 100",
    );
  }
  return { limit, normalizedQuery };
}

function faultKey(fault: SearchFault) {
  return `${fault.domain}:${
    fault.domain === "workspace" ? (fault.repositoryId ?? "") : ""
  }:${fault.code}`;
}

function normalizeFaults(faults: SearchFault[]) {
  const byKey = new Map<string, SearchFault>();

  for (const fault of faults) {
    const key = faultKey(fault);

    if (!byKey.has(key)) byKey.set(key, fault);
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.domain.localeCompare(right.domain) ||
      (left.domain === "workspace"
        ? (left.repositoryId ?? "")
        : ""
      ).localeCompare(
        right.domain === "workspace" ? (right.repositoryId ?? "") : "",
      ) ||
      left.code.localeCompare(right.code),
  );
}

function defaultSourceFault(source: SearchSource, error: unknown): SearchFault {
  const code =
    error instanceof SearchSourceError ? error.code : "source_unavailable";
  const common = {
    code,
    message:
      error instanceof SearchSourceError
        ? error.message
        : "Search source is unavailable",
  };

  return source.domain === "workspace"
    ? {
        ...common,
        domain: source.domain,
        repositoryId: source.repositoryId,
      }
    : { ...common, domain: source.domain };
}

export class SearchIndex<Context = void> implements SearchQuery<Context> {
  readonly #createCorpusKey: (value: unknown) => Promise<string> | string;
  readonly #maximumConcurrentLoads: number;
  readonly #maximumCachedQueries: number;
  readonly #maximumCachedSources: number;
  #activeLoads = 0;
  readonly #waitingLoads: Array<() => void> = [];
  readonly #queryCache = new Map<string, SearchResult[]>();
  readonly #sourceCache = new Map<
    string,
    { documents: SearchDocument[]; revision: string }
  >();
  readonly #sourceProvider: SearchSourceProvider<Context>;

  constructor({
    createCorpusKey,
    maximumConcurrentLoads = 4,
    maximumCachedQueries = 32,
    maximumCachedSources = 64,
    sourceProvider,
  }: {
    createCorpusKey(value: unknown): Promise<string> | string;
    maximumConcurrentLoads?: number;
    maximumCachedQueries?: number;
    maximumCachedSources?: number;
    sourceProvider: SearchSourceProvider<Context>;
  }) {
    if (!Number.isSafeInteger(maximumConcurrentLoads) || maximumConcurrentLoads < 1) {
      throw new RangeError("Search maximum concurrent loads must be a positive integer");
    }
    this.#createCorpusKey = createCorpusKey;
    this.#maximumConcurrentLoads = maximumConcurrentLoads;
    this.#maximumCachedQueries = maximumCachedQueries;
    this.#maximumCachedSources = maximumCachedSources;
    this.#sourceProvider = sourceProvider;
  }

  async search(
    request: SearchRequest,
    context: Context,
  ): Promise<SearchResponse> {
    const { limit, normalizedQuery } = validateRequest(request);
    const listed = await this.#sourceProvider.listSources(request, context);
    const faults = [...listed.faults];
    const revisions: Record<string, string> = {};
    const prepared = (
      await Promise.all(
        listed.sources.map(async (source) => {
          const sourceKey =
            source.domain === "workspace"
              ? `${source.domain}:${source.repositoryId}`
              : source.domain;

          try {
            const batch = await this.#runLoad(() => source.load());

            return { batch, source, sourceKey };
          } catch (error) {
            faults.push(
              source.createFault?.(error) ?? defaultSourceFault(source, error),
            );
            return null;
          }
        }),
      )
    ).filter((value) => value !== null);
    for (const { batch, sourceKey } of prepared) {
      revisions[sourceKey] = batch.revision;
    }
    const createKey = (normalizedFaults: SearchFault[]) =>
      this.#createCorpusKey({
        domains: request.domains ?? searchDomains,
        faults: normalizedFaults.map((fault) => ({
          code: fault.code,
          domain: fault.domain,
          repositoryId:
            fault.domain === "workspace" ? (fault.repositoryId ?? null) : null,
        })),
        query: normalizedQuery,
        repositoryIds: request.repositoryIds ?? null,
        revisions,
      });
    let normalizedFaults = normalizeFaults(faults);
    let key = await createKey(normalizedFaults);
    const cursor = request.cursor ? decodeSearchCursor(request.cursor) : null;
    let sorted = this.#readCachedResults(key);

    if (!sorted) {
      const initialFaultCount = faults.length;
      const results = await Promise.all(
        prepared.map(async ({ batch, source, sourceKey }) => {
          try {
            const documents = await this.#loadSourceDocuments(sourceKey, batch);
            return documents.flatMap((document) =>
              projectSearchDocumentResults(document, request, normalizedQuery),
            );
          } catch (error) {
            delete revisions[sourceKey];
            faults.push(
              source.createFault?.(error) ?? defaultSourceFault(source, error),
            );
            return [];
          }
        }),
      );
      if (faults.length !== initialFaultCount) {
        normalizedFaults = normalizeFaults(faults);
        key = await createKey(normalizedFaults);
      }
      sorted = sortSearchResults(results.flat());
      this.#cacheResults(key, sorted);
    }
    if (cursor && cursor.key !== key) {
      throw new SearchRequestError(
        "cursor_conflict",
        "Search results changed while paging",
      );
    }
    const offset = cursor?.offset ?? 0;
    const page = sorted.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    return {
      cursor:
        nextOffset < sorted.length ? encodeSearchCursor(key, nextOffset) : null,
      faults: normalizedFaults,
      results: page,
    };
  }

  #cacheResults(key: string, results: SearchResult[]) {
    this.#queryCache.delete(key);
    this.#queryCache.set(key, results);
    while (this.#queryCache.size > this.#maximumCachedQueries) {
      const oldest = this.#queryCache.keys().next().value;

      if (oldest === undefined) break;
      this.#queryCache.delete(oldest);
    }
  }

  #readCachedResults(key: string) {
    const results = this.#queryCache.get(key);

    if (!results) return null;
    this.#queryCache.delete(key);
    this.#queryCache.set(key, results);
    return results;
  }

  async #runLoad<T>(load: () => Promise<T>): Promise<T> {
    if (this.#activeLoads < this.#maximumConcurrentLoads && this.#waitingLoads.length === 0) {
      this.#activeLoads += 1;
    } else {
      await new Promise<void>((resolve) => this.#waitingLoads.push(resolve));
    }
    try {
      return await load();
    } finally {
      const next = this.#waitingLoads.shift();
      if (next) next();
      else this.#activeLoads -= 1;
    }
  }

  async #loadSourceDocuments(sourceKey: string, batch: SearchSourceBatch) {
    const cached = this.#sourceCache.get(sourceKey);

    if (cached?.revision === batch.revision) {
      this.#sourceCache.delete(sourceKey);
      this.#sourceCache.set(sourceKey, cached);
      return cached.documents;
    }
    const documents = await this.#runLoad(() => batch.loadDocuments());

    this.#sourceCache.delete(sourceKey);
    this.#sourceCache.set(sourceKey, {
      documents,
      revision: batch.revision,
    });
    while (this.#sourceCache.size > this.#maximumCachedSources) {
      const oldest = this.#sourceCache.keys().next().value;

      if (oldest === undefined) break;
      this.#sourceCache.delete(oldest);
    }
    return documents;
  }
}

export function createSearchQuery<Context = void>(
  options: ConstructorParameters<typeof SearchIndex<Context>>[0],
): SearchQuery<Context> {
  return new SearchIndex(options);
}
