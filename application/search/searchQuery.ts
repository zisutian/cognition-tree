// SPDX-License-Identifier: GPL-3.0-or-later

export const searchDomains = ["workspace", "journal", "todo"] as const;

export type SearchDomain = (typeof searchDomains)[number];
export type SearchResourceVersion = `sha256:${string}`;

export type SearchRequest = {
  cursor?: string;
  domains?: SearchDomain[];
  limit?: number;
  query: string;
  repositoryIds?: string[];
  updatedAfter?: string;
};

type SearchResultBase = {
  blockId: string | null;
  resourceId: string;
  snippet: string;
  title: string;
  updatedAt: string;
  version: SearchResourceVersion;
};

export type SearchResult =
  | (SearchResultBase & {
      domain: "workspace";
      repositoryId: string;
    })
  | (SearchResultBase & {
      domain: "journal" | "todo";
      repositoryId?: never;
    });

export type SearchFault =
  | {
      code: "source_invalid" | "source_unavailable";
      domain: "workspace";
      message: string;
      repositoryId?: string;
    }
  | {
      code: "source_invalid" | "source_unavailable";
      domain: "journal" | "todo";
      message: string;
      repositoryId?: never;
    };

export type SearchResponse = {
  cursor: string | null;
  faults: SearchFault[];
  results: SearchResult[];
};

export type SearchDocumentBlock = {
  blockId: string;
  body: string | null;
  text: string;
  updatedAt: string;
};

type SearchDocumentBase = {
  blocks: SearchDocumentBlock[];
  editableText: string;
  resourceId: string;
  title: string;
  updatedAt: string;
  version: SearchResourceVersion;
};

export type SearchDocument =
  | (SearchDocumentBase & {
      domain: "workspace";
      repositoryId: string;
    })
  | (SearchDocumentBase & {
      domain: "journal" | "todo";
      repositoryId?: never;
    });

export type SearchSourceBatch = {
  documents: SearchDocument[];
  revision: string;
};

export type SearchSource =
  | {
      createFault?(error: unknown): SearchFault;
      domain: "workspace";
      load(): Promise<SearchSourceBatch>;
      repositoryId: string;
    }
  | {
      createFault?(error: unknown): SearchFault;
      domain: "journal" | "todo";
      load(): Promise<SearchSourceBatch>;
      repositoryId?: never;
    };

export type SearchSourceList = {
  faults: SearchFault[];
  sources: SearchSource[];
};

export type SearchSourceProvider<Context = void> = {
  listSources(
    request: SearchRequest,
    context: Context,
  ): Promise<SearchSourceList>;
};

export type SearchQuery<Context = void> = {
  search(request: SearchRequest, context: Context): Promise<SearchResponse>;
};

export class SearchRequestError extends Error {
  readonly code: "cursor_conflict" | "invalid_cursor" | "invalid_request";

  constructor(
    code: SearchRequestError["code"],
    message: string,
  ) {
    super(message);
    this.name = "SearchRequestError";
    this.code = code;
  }
}

export class SearchSourceError extends Error {
  readonly code: SearchFault["code"];

  constructor(code: SearchSourceError["code"], message: string) {
    super(message);
    this.name = "SearchSourceError";
    this.code = code;
  }
}

export function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("und");
}

type NormalizedGrapheme = {
  normalizedEnd: number;
  normalizedStart: number;
  sourceEnd: number;
  sourceStart: number;
};

type Segment = { index: number; segment: string };

function segmentGraphemes(source: string): Segment[] {
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => {
        segment(value: string): Iterable<Segment>;
      };
    }
  ).Segmenter;

  if (Segmenter) {
    return [...new Segmenter("und", { granularity: "grapheme" }).segment(
      source,
    )];
  }
  const result: Segment[] = [];
  let index = 0;

  for (const segment of source) {
    result.push({ index, segment });
    index += segment.length;
  }
  return result;
}

function createNormalizedSourceMap(source: string) {
  let normalized = "";
  const graphemes: NormalizedGrapheme[] = [];

  for (const current of segmentGraphemes(source)) {
    const segment = normalizeSearchText(current.segment);
    const normalizedStart = normalized.length;

    normalized += segment;
    graphemes.push({
      normalizedEnd: normalized.length,
      normalizedStart,
      sourceEnd: current.index + current.segment.length,
      sourceStart: current.index,
    });
  }
  return { graphemes, normalized };
}

function sourceRangeForNormalizedRange(
  source: string,
  graphemes: readonly NormalizedGrapheme[],
  from: number,
  to: number,
) {
  const first = graphemes.find(({ normalizedEnd }) => normalizedEnd > from);
  let last: NormalizedGrapheme | undefined;

  for (let index = graphemes.length - 1; index >= 0; index -= 1) {
    if (graphemes[index]!.normalizedStart < to) {
      last = graphemes[index];
      break;
    }
  }

  return {
    from: first?.sourceStart ?? source.length,
    to: last?.sourceEnd ?? first?.sourceEnd ?? source.length,
  };
}

export function createSearchSnippet(source: string, normalizedQuery: string) {
  const mapped = createNormalizedSourceMap(source);
  const position = mapped.normalized.indexOf(normalizedQuery);
  const normalizedStart = Math.max(0, position < 0 ? 0 : position - 48);
  const normalizedEnd = Math.min(
    mapped.normalized.length,
    Math.max(
      normalizedStart + 160,
      position < 0 ? 0 : position + normalizedQuery.length,
    ),
  );
  const range = sourceRangeForNormalizedRange(
    source,
    mapped.graphemes,
    normalizedStart,
    normalizedEnd,
  );

  return `${range.from > 0 ? "…" : ""}${source.slice(range.from, range.to)}${
    range.to < source.length ? "…" : ""
  }`;
}

function includeUpdatedAt(updatedAt: string, request: SearchRequest) {
  return !request.updatedAfter || updatedAt >= request.updatedAfter;
}

function createResult(
  document: SearchDocument,
  value: Omit<SearchResultBase, "resourceId" | "title" | "version">,
): SearchResult {
  const common = {
    ...value,
    resourceId: document.resourceId,
    title: document.title,
    version: document.version,
  };

  return document.domain === "workspace"
    ? {
        ...common,
        domain: document.domain,
        repositoryId: document.repositoryId,
      }
    : { ...common, domain: document.domain };
}

export function projectSearchDocumentResults(
  document: SearchDocument,
  request: SearchRequest,
  normalizedQuery = normalizeSearchText(request.query.trim()),
): SearchResult[] {
  const blockResults: SearchResult[] = [];

  for (const block of document.blocks) {
    if (!includeUpdatedAt(block.updatedAt, request)) continue;
    const text = block.body === null
      ? block.text
      : `${block.text}\n${block.body}`;

    if (!normalizeSearchText(text).includes(normalizedQuery)) continue;
    blockResults.push(createResult(document, {
      blockId: block.blockId,
      snippet: createSearchSnippet(text, normalizedQuery),
      updatedAt: block.updatedAt,
    }));
  }
  if (blockResults.length > 0) return blockResults;
  const titleOrDocument = `${document.title}\n${document.editableText}`;

  return (
      includeUpdatedAt(document.updatedAt, request) &&
      normalizeSearchText(titleOrDocument).includes(normalizedQuery)
    )
    ? [createResult(document, {
        blockId: null,
        snippet: createSearchSnippet(titleOrDocument, normalizedQuery),
        updatedAt: document.updatedAt,
      })]
    : [];
}

function compareBlockIds(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

export function sortSearchResults(results: SearchResult[]) {
  return results.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.domain.localeCompare(right.domain) ||
    (left.domain === "workspace" ? left.repositoryId : "").localeCompare(
      right.domain === "workspace" ? right.repositoryId : "",
    ) ||
    left.resourceId.localeCompare(right.resourceId) ||
    compareBlockIds(left.blockId, right.blockId)
  );
}

function encodeCursor(key: string, offset: number) {
  return `v1_${offset}_${key}`;
}

function decodeCursor(source: string) {
  const match = /^v1_(0|[1-9]\d*)_([A-Za-z0-9_-]{1,200})$/.exec(source);

  if (!match) {
    throw new SearchRequestError("invalid_cursor", "Search cursor is invalid");
  }
  const offset = Number(match[1]);

  if (!Number.isSafeInteger(offset)) {
    throw new SearchRequestError("invalid_cursor", "Search cursor is invalid");
  }
  return { key: match[2]!, offset };
}

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
    fault.domain === "workspace" ? fault.repositoryId ?? "" : ""
  }:${fault.code}`;
}

function normalizeFaults(faults: SearchFault[]) {
  const byKey = new Map<string, SearchFault>();

  for (const fault of faults) {
    const key = faultKey(fault);

    if (!byKey.has(key)) byKey.set(key, fault);
  }
  return [...byKey.values()].sort((left, right) =>
    left.domain.localeCompare(right.domain) ||
    (
      left.domain === "workspace" ? left.repositoryId ?? "" : ""
    ).localeCompare(
      right.domain === "workspace" ? right.repositoryId ?? "" : "",
    ) ||
    left.code.localeCompare(right.code)
  );
}

function defaultSourceFault(source: SearchSource, error: unknown): SearchFault {
  const code = error instanceof SearchSourceError
    ? error.code
    : "source_unavailable";
  const common = {
    code,
    message: error instanceof SearchSourceError
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
  readonly #maximumCachedQueries: number;
  readonly #queryCache = new Map<string, SearchResult[]>();
  readonly #sourceProvider: SearchSourceProvider<Context>;

  constructor({
    createCorpusKey,
    maximumCachedQueries = 32,
    sourceProvider,
  }: {
    createCorpusKey(value: unknown): Promise<string> | string;
    maximumCachedQueries?: number;
    sourceProvider: SearchSourceProvider<Context>;
  }) {
    this.#createCorpusKey = createCorpusKey;
    this.#maximumCachedQueries = maximumCachedQueries;
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
    const results: SearchResult[] = [];

    await Promise.all(listed.sources.map(async (source) => {
      const sourceKey = source.domain === "workspace"
        ? `${source.domain}:${source.repositoryId}`
        : source.domain;

      try {
        const batch = await source.load();

        revisions[sourceKey] = batch.revision;
        for (const document of batch.documents) {
          results.push(
            ...projectSearchDocumentResults(
              document,
              request,
              normalizedQuery,
            ),
          );
        }
      } catch (error) {
        faults.push(
          source.createFault?.(error) ?? defaultSourceFault(source, error),
        );
      }
    }));
    const normalizedFaults = normalizeFaults(faults);
    const key = await this.#createCorpusKey({
      domains: request.domains ?? searchDomains,
      faults: normalizedFaults.map((fault) => ({
        code: fault.code,
        domain: fault.domain,
        repositoryId: fault.domain === "workspace"
          ? fault.repositoryId ?? null
          : null,
      })),
      query: normalizedQuery,
      repositoryIds: request.repositoryIds ?? null,
      revisions,
      updatedAfter: request.updatedAfter ?? null,
    });
    const cursor = request.cursor ? decodeCursor(request.cursor) : null;

    if (cursor && cursor.key !== key) {
      throw new SearchRequestError(
        "cursor_conflict",
        "Search results changed while paging",
      );
    }
    const sorted = this.#readCachedResults(key) ??
      sortSearchResults(results);

    this.#cacheResults(key, sorted);
    const offset = cursor?.offset ?? 0;
    const page = sorted.slice(offset, offset + limit);
    const nextOffset = offset + page.length;

    return {
      cursor: nextOffset < sorted.length
        ? encodeCursor(key, nextOffset)
        : null,
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
}

export function createSearchQuery<Context = void>(
  options: ConstructorParameters<typeof SearchIndex<Context>>[0],
): SearchQuery<Context> {
  return new SearchIndex(options);
}
