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

export type SearchResult = {
  blockId: string | null;
  domain: SearchDomain;
  repositoryId?: string;
  resourceId: string;
  snippet: string;
  title: string;
  updatedAt: string;
  version: SearchResourceVersion;
};

export type SearchFault = {
  code: "source_invalid" | "source_unavailable";
  domain: SearchDomain;
  message: string;
  repositoryId?: string;
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

export type SearchDocument = {
  blocks: SearchDocumentBlock[];
  domain: SearchDomain;
  editableText: string;
  repositoryId?: string;
  resourceId: string;
  title: string;
  updatedAt: string;
  version: SearchResourceVersion;
};

export type SearchSourceBatch = {
  documents: SearchDocument[];
  revision: string;
};

export type SearchSource = {
  createFault?(error: unknown): SearchFault;
  domain: SearchDomain;
  load(): Promise<SearchSourceBatch>;
  repositoryId?: string;
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

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("und");
}

function createSearchSnippet(source: string, normalizedQuery: string) {
  const normalizedSource = normalizeSearchText(source);
  const position = normalizedSource.indexOf(normalizedQuery);
  const start = Math.max(0, position < 0 ? 0 : position - 48);
  const end = Math.min(source.length, start + 160);

  return `${start > 0 ? "…" : ""}${source.slice(start, end)}${
    end < source.length ? "…" : ""
  }`;
}

function includeUpdatedAt(updatedAt: string, request: SearchRequest) {
  return !request.updatedAfter || updatedAt >= request.updatedAfter;
}

export function projectSearchDocumentResults(
  document: SearchDocument,
  request: SearchRequest,
  normalizedQuery = normalizeSearchText(request.query.trim()),
): SearchResult[] {
  const blockResults: SearchResult[] = [];
  let hasMatchingBlock = false;

  for (const block of document.blocks) {
    const text = `${block.text}\n${block.body ?? ""}`;

    if (!normalizeSearchText(text).includes(normalizedQuery)) continue;
    hasMatchingBlock = true;
    if (!includeUpdatedAt(block.updatedAt, request)) continue;
    blockResults.push({
      blockId: block.blockId,
      domain: document.domain,
      ...(document.repositoryId
        ? { repositoryId: document.repositoryId }
        : {}),
      resourceId: document.resourceId,
      snippet: createSearchSnippet(text, normalizedQuery),
      title: document.title,
      updatedAt: block.updatedAt,
      version: document.version,
    });
  }
  if (hasMatchingBlock) return blockResults;
  const titleOrDocument = `${document.title}\n${document.editableText}`;

  return (
      includeUpdatedAt(document.updatedAt, request) &&
      normalizeSearchText(titleOrDocument).includes(normalizedQuery)
    )
    ? [{
        blockId: null,
        domain: document.domain,
        ...(document.repositoryId
          ? { repositoryId: document.repositoryId }
          : {}),
        resourceId: document.resourceId,
        snippet: createSearchSnippet(titleOrDocument, normalizedQuery),
        title: document.title,
        updatedAt: document.updatedAt,
        version: document.version,
      }]
    : [];
}

function compareBlockIds(
  left: string | null,
  right: string | null,
) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

export function sortSearchResults(results: SearchResult[]) {
  return results.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.domain.localeCompare(right.domain) ||
    (left.repositoryId ?? "").localeCompare(right.repositoryId ?? "") ||
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

function normalizeFaults(faults: SearchFault[]) {
  const byKey = new Map<string, SearchFault>();

  for (const fault of faults) {
    const key = `${fault.domain}:${fault.repositoryId ?? ""}:${fault.code}`;

    if (!byKey.has(key)) byKey.set(key, fault);
  }
  return [...byKey.values()].sort((left, right) =>
    left.domain.localeCompare(right.domain) ||
    (left.repositoryId ?? "").localeCompare(right.repositoryId ?? "") ||
    left.code.localeCompare(right.code)
  );
}

export function createSearchQuery<Context = void>({
  createCorpusKey,
  sourceProvider,
}: {
  createCorpusKey(value: unknown): Promise<string> | string;
  sourceProvider: SearchSourceProvider<Context>;
}): SearchQuery<Context> {
  let cache: { key: string; results: SearchResult[] } | null = null;

  return {
    async search(request, context) {
      const { limit, normalizedQuery } = validateRequest(request);
      const listed = await sourceProvider.listSources(request, context);
      const faults = [...listed.faults];
      const revisions: Record<string, string> = {};
      const results: SearchResult[] = [];

      await Promise.all(listed.sources.map(async (source) => {
        const sourceKey = `${source.domain}:${source.repositoryId ?? ""}`;

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
            source.createFault?.(error) ?? {
              code: "source_unavailable",
              domain: source.domain,
              message: "Search source is unavailable",
              ...(source.repositoryId
                ? { repositoryId: source.repositoryId }
                : {}),
            },
          );
        }
      }));
      const normalizedFaults = normalizeFaults(faults);
      const key = await createCorpusKey({
        domains: request.domains ?? searchDomains,
        faults: normalizedFaults.map(({ code, domain, repositoryId }) => ({
          code,
          domain,
          repositoryId: repositoryId ?? null,
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
      const sorted = cache?.key === key
        ? cache.results
        : sortSearchResults(results);

      cache = { key, results: sorted };
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
    },
  };
}
