// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  SearchDocument,
  SearchRequest,
  SearchResult,
} from "./searchTypes.ts";

export function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("und");
}

type Segment = { index: number; segment: string };

function* segmentGraphemes(source: string): Iterable<Segment> {
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
    yield* new Segmenter("und", { granularity: "grapheme" }).segment(source);
    return;
  }
  let index = 0;

  for (const segment of source) {
    yield { index, segment };
    index += segment.length;
  }
}

function sourceRangeForNormalizedRange(
  source: string,
  from: number,
  to: number,
) {
  let normalizedOffset = 0;
  let sourceStart: number | null = null;

  for (const current of segmentGraphemes(source)) {
    const normalizedEnd =
      normalizedOffset + normalizeSearchText(current.segment).length;
    if (sourceStart === null && normalizedEnd > from)
      sourceStart = current.index;
    if (normalizedEnd >= to) {
      return {
        from: sourceStart ?? current.index,
        to: current.index + current.segment.length,
      };
    }
    normalizedOffset = normalizedEnd;
  }
  return { from: sourceStart ?? source.length, to: source.length };
}

function createSearchSnippet(
  source: string,
  normalizedSource: string,
  normalizedQuery: string,
) {
  if (normalizedSource.length <= 160) return source;
  // Locate the match in the same whole-text normalization used for matching.
  // Per-grapheme casing can differ (for example, a final Greek sigma).
  const position = normalizedSource.indexOf(normalizedQuery);
  const normalizedStart = Math.max(0, position < 0 ? 0 : position - 48);
  const normalizedEnd = Math.min(
    normalizedSource.length,
    Math.max(
      normalizedStart + 160,
      position < 0 ? 0 : position + normalizedQuery.length,
    ),
  );
  // Only map the prefix needed to reach this snippet; do not allocate a map
  // for the rest of a large multiline block.
  const range = sourceRangeForNormalizedRange(
    source,
    normalizedStart,
    normalizedEnd,
  );
  return `${range.from > 0 ? "…" : ""}${source.slice(range.from, range.to)}${
    range.to < source.length ? "…" : ""
  }`;
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
    const text =
      block.body === null ? block.text : `${block.text}\n${block.body}`;

    const normalizedText = normalizeSearchText(text);
    if (!normalizedText.includes(normalizedQuery)) continue;
    blockResults.push(
      createResult(document, {
        blockId: block.blockId,
        snippet: createSearchSnippet(text, normalizedText, normalizedQuery),
        updatedAt: block.updatedAt,
      }),
    );
  }
  if (blockResults.length > 0) return blockResults;
  const titleOrDocument = `${document.title}\n${document.editableText}`;

  const normalizedText = normalizeSearchText(titleOrDocument);
  return normalizedText.includes(normalizedQuery)
    ? [
        createResult(document, {
          blockId: null,
          snippet: createSearchSnippet(
            titleOrDocument,
            normalizedText,
            normalizedQuery,
          ),
          updatedAt: document.updatedAt,
        }),
      ]
    : [];
}

function compareBlockIds(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

export function sortSearchResults(results: SearchResult[]) {
  return results.sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      left.domain.localeCompare(right.domain) ||
      (left.domain === "workspace" ? left.repositoryId : "").localeCompare(
        right.domain === "workspace" ? right.repositoryId : "",
      ) ||
      left.resourceId.localeCompare(right.resourceId) ||
      compareBlockIds(left.blockId, right.blockId),
  );
}
