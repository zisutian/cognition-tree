// SPDX-License-Identifier: GPL-3.0-or-later

import {
  collectCtnInlineReferences,
  ctnGlobalReferenceType,
  normalizeCtnReferenceText,
} from "../../ctn/parser/inlineReferences.ts";
import {
  analyzeCtnSource,
  reprojectCtnAnalysisPresentation,
  type CtnCanonicalSourceAnalysis,
} from "../../ctn/analysis/sourceAnalysis.ts";
import {
  createCtnBlockIdRegistry,
  updateCtnBlockIdRegistry,
  type CtnBlockIdRegistry,
  type CtnBlockIdRegistryChange,
} from "../../ctn/analysis/blockIdRegistry.ts";
import { requireCtnSyntax } from "../../ctn/syntax/compiler.ts";
import type { CtnCompiledSyntax } from "../../ctn/syntax/types.ts";
import {
  createPortableNameKey,
  getPortableNameIssue,
} from "../../naming/portableName.ts";
import {
  listJournalEntries,
  type JournalContent,
  type JournalEntry,
  type JournalEntryId,
} from "../model/journalContent.ts";
import {
  validateJournalContentAnalysis,
  type ValidatedJournalContentAnalysis,
} from "../model/journalValidation.ts";

export type ParsedJournalIndexEntry = {
  analysis: CtnCanonicalSourceAnalysis;
  entry: JournalEntry;
  source: string;
  title: string;
};

export type JournalParseCacheEntry = {
  analysis: CtnCanonicalSourceAnalysis;
  analysisKey: string;
  source: string;
};

export type JournalWorkspaceReference = {
  count: number;
  lineNumber: number;
  noteName: string;
  repositoryName: string;
  sourceEntryId: JournalEntryId;
  targetText: string;
};

export type InvalidJournalWorkspaceReference = Omit<
  JournalWorkspaceReference,
  "noteName" | "repositoryName"
> & {
  reason: "invalid-note-name" | "invalid-repository-name" | "invalid-shape";
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
  invalidWorkspaceReferences: InvalidJournalWorkspaceReference[];
  workspaceReferences: JournalWorkspaceReference[];
};

export type JournalParseIndex = {
  analysisStats: {
    analyzedEntryIds: readonly JournalEntryId[];
    runCount: number;
    updatedBlockIdOwnerIds: readonly JournalEntryId[];
  };
  blockIdRegistry: CtnBlockIdRegistry<JournalEntryId>;
  blockIds: ReadonlySet<string>;
  entries: readonly ParsedJournalIndexEntry[];
  entryById: ReadonlyMap<JournalEntryId, ParsedJournalIndexEntry>;
  getParsedEntry(entryId: JournalEntryId): ParsedJournalIndexEntry | null;
  latestTimestamp: string | null;
  parseCache: ReadonlyMap<JournalEntryId, JournalParseCacheEntry>;
  referenceGraph: JournalReferenceGraph;
  syntax: CtnCompiledSyntax;
  syntaxSource: string;
  titleIndex: ReadonlyMap<string, readonly ParsedJournalIndexEntry[]>;
  validation: ValidatedJournalContentAnalysis;
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
  const workspaceReferenceCounts = new Map<string, JournalWorkspaceReference>();
  const invalidWorkspaceReferenceCounts = new Map<
    string,
    InvalidJournalWorkspaceReference
  >();

  for (const parsed of entries) {
    for (const reference of collectCtnInlineReferences(
      parsed.analysis.document,
      ctnGlobalReferenceType,
    )) {
      const targetText = normalizeCtnReferenceText(reference.text);

      if (!targetText) {
        continue;
      }
      if (targetText.includes(":")) {
        const segments = targetText.split(":");
        const repositoryName = segments[0] ?? "";
        const noteName = segments[1] ?? "";
        const reason = segments.length !== 2 || !repositoryName || !noteName
          ? "invalid-shape"
          : getPortableNameIssue(repositoryName) !== null
            ? "invalid-repository-name"
            : getPortableNameIssue(noteName) !== null
              ? "invalid-note-name"
              : null;
        const key = `${parsed.entry.id}->${targetText}`;

        if (reason !== null) {
          const current = invalidWorkspaceReferenceCounts.get(key);

          invalidWorkspaceReferenceCounts.set(key, {
            count: (current?.count ?? 0) + 1,
            lineNumber: Math.min(
              current?.lineNumber ?? reference.lineNumber,
              reference.lineNumber,
            ),
            reason,
            sourceEntryId: parsed.entry.id,
            targetText,
          });
          continue;
        }
        const normalizedRepositoryName = createPortableNameKey(repositoryName);
        const normalizedNoteName = createPortableNameKey(noteName);
        const workspaceKey =
          `${parsed.entry.id}->${normalizedRepositoryName}:${normalizedNoteName}`;
        const current = workspaceReferenceCounts.get(workspaceKey);

        workspaceReferenceCounts.set(workspaceKey, {
          count: (current?.count ?? 0) + 1,
          lineNumber: Math.min(
            current?.lineNumber ?? reference.lineNumber,
            reference.lineNumber,
          ),
          noteName,
          repositoryName,
          sourceEntryId: parsed.entry.id,
          targetText,
        });
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
    invalidWorkspaceReferences: [...invalidWorkspaceReferenceCounts.values()],
    workspaceReferences: [...workspaceReferenceCounts.values()],
  };
}

export function createJournalParseIndex(
  content: JournalContent,
  previousIndex?: JournalParseIndex | null,
  analysisOverrides?: ReadonlyMap<
    JournalEntryId,
    CtnCanonicalSourceAnalysis
  >,
): JournalParseIndex {
  const syntax = previousIndex?.syntaxSource === content.syntaxSource
    ? previousIndex.syntax
    : requireCtnSyntax(content.syntaxSource, "journal");
  const parseCache = new Map<JournalEntryId, JournalParseCacheEntry>();
  const analyzedEntryIds: JournalEntryId[] = [];
  const analysisByEntryId = new Map(
    listJournalEntries(content).map(
      (entry): [JournalEntryId, CtnCanonicalSourceAnalysis] => {
        const cached = previousIndex?.parseCache.get(entry.id);
        const override = analysisOverrides?.get(entry.id);
        let analysis: CtnCanonicalSourceAnalysis;

        if (
          override?.sourceText.source === entry.source &&
          override.syntax.analysisKey === syntax.analysisKey
        ) {
          analysis = override.syntax.presentationKey === syntax.presentationKey
            ? override
            : reprojectCtnAnalysisPresentation(override, syntax);
        } else if (
          cached?.source === entry.source &&
          cached.analysisKey === syntax.analysisKey
        ) {
          analysis = cached.analysis.syntax.presentationKey ===
              syntax.presentationKey
            ? cached.analysis
            : reprojectCtnAnalysisPresentation(cached.analysis, syntax);
        } else {
          analyzedEntryIds.push(entry.id);
          analysis = analyzeCtnSource({
            mode: { kind: "canonical-document" },
            source: entry.source,
            syntax,
          });
        }

        return [entry.id, analysis];
      },
    ),
  );
  const validated = validateJournalContentAnalysis(content, {
    analysisByEntryId,
    syntax,
  });
  const entries: readonly ParsedJournalIndexEntry[] = validated.entries.map(
    (parsed) => ({
      ...parsed,
      source: parsed.entry.source,
    }),
  );

  for (const { analysis, entry } of entries) {
    parseCache.set(entry.id, {
      analysis,
      analysisKey: syntax.analysisKey,
      source: entry.source,
    });
  }
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
  const canUpdateBlockIdRegistry =
    previousIndex?.syntax.blockGrammarKey === syntax.blockGrammarKey;
  const updatedBlockIdOwnerIds: JournalEntryId[] = [];
  let blockIdRegistry: CtnBlockIdRegistry<JournalEntryId>;

  if (previousIndex && canUpdateBlockIdRegistry) {
    const currentEntryIds = new Set(entries.map(({ entry }) => entry.id));
    const changes: CtnBlockIdRegistryChange<JournalEntryId>[] = [];

    for (
      const ownerId of previousIndex.blockIdRegistry.blockIdsByOwner.keys()
    ) {
      if (!currentEntryIds.has(ownerId)) {
        changes.push({ entry: null, ownerId });
        updatedBlockIdOwnerIds.push(ownerId);
      }
    }
    for (const parsed of entries) {
      const previousCacheEntry = previousIndex.parseCache.get(parsed.entry.id);

      if (
        !previousCacheEntry ||
        previousCacheEntry.source !== parsed.entry.source
      ) {
        changes.push({
          entry: {
            analysis: parsed.analysis,
            ownerId: parsed.entry.id,
          },
          ownerId: parsed.entry.id,
        });
        updatedBlockIdOwnerIds.push(parsed.entry.id);
      }
    }
    blockIdRegistry = updateCtnBlockIdRegistry(
      previousIndex.blockIdRegistry,
      changes,
    );
  } else {
    updatedBlockIdOwnerIds.push(...entries.map(({ entry }) => entry.id));
    blockIdRegistry = createCtnBlockIdRegistry(
      entries.map(({ analysis, entry }) => ({
        analysis,
        ownerId: entry.id,
      })),
    );
  }
  let latestTimestamp: string | null = null;
  const includeTimestamp = (timestamp: string) => {
    if (
      latestTimestamp === null ||
      Date.parse(timestamp) > Date.parse(latestTimestamp)
    ) {
      latestTimestamp = timestamp;
    }
  };

  for (const { analysis, entry } of entries) {
    includeTimestamp(entry.updatedAt);
    analysis.document.blocks.forEach((block) =>
      includeTimestamp(block.metadata.updatedAt)
    );
  }

  return {
    analysisStats: {
      analyzedEntryIds,
      runCount: analyzedEntryIds.length,
      updatedBlockIdOwnerIds,
    },
    blockIdRegistry,
    blockIds: blockIdRegistry.blockIds,
    entries,
    entryById,
    getParsedEntry(entryId) {
      return entryById.get(entryId) ?? null;
    },
    latestTimestamp,
    parseCache,
    referenceGraph,
    syntax,
    syntaxSource: content.syntaxSource,
    titleIndex,
    validation: validated,
  };
}
