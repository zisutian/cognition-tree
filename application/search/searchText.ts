// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  SearchDocument,
  SearchRequest,
  SearchResult,
} from "./searchTypes.ts";

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
  value: Omit<
    SearchResult,
    "domain" | "repositoryId" | "resourceId" | "title" | "version"
  >,
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
