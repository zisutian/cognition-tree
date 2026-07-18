// SPDX-License-Identifier: GPL-3.0-or-later

import {
  collectCtnInlineReferences,
  ctnGlobalReferenceType,
  normalizeCtnReferenceText,
} from "../../ctn/parser/inlineReferences.ts";
import { parseCtnCanonicalDocument } from "../../ctn/parser/parseCtnDocument.ts";
import type { CtnCanonicalDocument } from "../../ctn/parser/types.ts";
import {
  formatJournalEntryTitle,
  type JournalContent,
  type JournalEntry,
  type JournalEntryId,
} from "../model/journalContent.ts";
import { journalCtnSyntaxProfileV1 } from "../syntax/journalSyntaxV1.ts";

export type ParsedJournalIndexEntry = {
  document: CtnCanonicalDocument;
  entry: JournalEntry;
  source: string;
  title: string;
};

export type JournalParseCacheEntry = {
  document: CtnCanonicalDocument;
  source: string;
};

export type JournalReferenceGraphNode = {
  id: JournalEntryId;
  isolated: boolean;
  referencesIn: number;
  referencesOut: number;
  title: string;
};

export type JournalReferenceGraphEdge = {
  count: number;
  id: string;
  sourceEntryId: JournalEntryId;
  targetEntryId: JournalEntryId;
  targetTitle: string;
};

export type UnresolvedJournalReference = {
  count: number;
  lineNumber: number;
  sourceEntryId: JournalEntryId;
  targetText: string;
};

export type AmbiguousJournalReference = UnresolvedJournalReference & {
  candidateEntryIds: JournalEntryId[];
};

export type JournalReferenceGraph = {
  ambiguousReferences: AmbiguousJournalReference[];
  edges: JournalReferenceGraphEdge[];
  nodes: JournalReferenceGraphNode[];
  unresolvedReferences: UnresolvedJournalReference[];
};

export type JournalParseIndex = {
  entries: readonly ParsedJournalIndexEntry[];
  entryById: ReadonlyMap<JournalEntryId, ParsedJournalIndexEntry>;
  getParsedEntry(entryId: JournalEntryId): ParsedJournalIndexEntry | null;
  parseCache: ReadonlyMap<JournalEntryId, JournalParseCacheEntry>;
  referenceGraph: JournalReferenceGraph;
  titleIndex: ReadonlyMap<string, readonly ParsedJournalIndexEntry[]>;
};

function incrementCounter(
  counters: Map<JournalEntryId, number>,
  entryId: JournalEntryId,
) {
  counters.set(entryId, (counters.get(entryId) ?? 0) + 1);
}

function createReferenceGraph(
  entries: readonly ParsedJournalIndexEntry[],
  titleIndex: ReadonlyMap<string, readonly ParsedJournalIndexEntry[]>,
): JournalReferenceGraph {
  const referencesIn = new Map<JournalEntryId, number>();
  const referencesOut = new Map<JournalEntryId, number>();
  const edgeCounts = new Map<string, JournalReferenceGraphEdge>();
  const unresolvedCounts = new Map<string, UnresolvedJournalReference>();
  const ambiguousCounts = new Map<string, AmbiguousJournalReference>();

  for (const parsed of entries) {
    for (const reference of collectCtnInlineReferences(
      parsed.document,
      ctnGlobalReferenceType,
    )) {
      const targetText = normalizeCtnReferenceText(reference.text);

      if (!targetText) {
        continue;
      }
      const targets = titleIndex.get(targetText) ?? [];
      const key = `${parsed.entry.id}->${targetText}`;

      incrementCounter(referencesOut, parsed.entry.id);
      if (targets.length === 0) {
        const current = unresolvedCounts.get(key);

        unresolvedCounts.set(key, {
          count: (current?.count ?? 0) + 1,
          lineNumber: Math.min(
            current?.lineNumber ?? reference.lineNumber,
            reference.lineNumber,
          ),
          sourceEntryId: parsed.entry.id,
          targetText,
        });
        continue;
      }
      if (targets.length > 1) {
        const current = ambiguousCounts.get(key);

        ambiguousCounts.set(key, {
          candidateEntryIds: targets.map(({ entry }) => entry.id),
          count: (current?.count ?? 0) + 1,
          lineNumber: Math.min(
            current?.lineNumber ?? reference.lineNumber,
            reference.lineNumber,
          ),
          sourceEntryId: parsed.entry.id,
          targetText,
        });
        continue;
      }

      const target = targets[0];
      const edgeKey = `${parsed.entry.id}->${target.entry.id}->${targetText}`;
      const current = edgeCounts.get(edgeKey);

      edgeCounts.set(edgeKey, {
        count: (current?.count ?? 0) + 1,
        id: edgeKey,
        sourceEntryId: parsed.entry.id,
        targetEntryId: target.entry.id,
        targetTitle: targetText,
      });
      incrementCounter(referencesIn, target.entry.id);
    }
  }

  return {
    ambiguousReferences: [...ambiguousCounts.values()],
    edges: [...edgeCounts.values()],
    nodes: entries.map(({ entry, title }) => {
      const incoming = referencesIn.get(entry.id) ?? 0;
      const outgoing = referencesOut.get(entry.id) ?? 0;

      return {
        id: entry.id,
        isolated: incoming === 0 && outgoing === 0,
        referencesIn: incoming,
        referencesOut: outgoing,
        title,
      };
    }),
    unresolvedReferences: [...unresolvedCounts.values()],
  };
}

export function createJournalParseIndex(
  content: JournalContent,
  previousIndex?: JournalParseIndex | null,
): JournalParseIndex {
  const parseCache = new Map<JournalEntryId, JournalParseCacheEntry>();
  const entries = content.entries.map((entry): ParsedJournalIndexEntry => {
    const cached = previousIndex?.parseCache.get(entry.id);
    const document = cached?.source === entry.source
      ? cached.document
      : parseCtnCanonicalDocument(entry.source, journalCtnSyntaxProfileV1);
    const title = formatJournalEntryTitle(
      entry.createdAt,
      entry.timezoneOffsetMinutes,
    );

    parseCache.set(entry.id, { document, source: entry.source });
    return { document, entry, source: entry.source, title };
  });
  const entryById = new Map(entries.map((entry) => [entry.entry.id, entry]));
  const mutableTitleIndex = new Map<string, ParsedJournalIndexEntry[]>();

  for (const entry of entries) {
    const key = normalizeCtnReferenceText(entry.title);
    const current = mutableTitleIndex.get(key);

    if (current) {
      current.push(entry);
    } else {
      mutableTitleIndex.set(key, [entry]);
    }
  }
  const titleIndex: ReadonlyMap<
    string,
    readonly ParsedJournalIndexEntry[]
  > = mutableTitleIndex;
  const referenceGraph = createReferenceGraph(entries, titleIndex);

  return {
    entries,
    entryById,
    getParsedEntry(entryId) {
      return entryById.get(entryId) ?? null;
    },
    parseCache,
    referenceGraph,
    titleIndex,
  };
}
