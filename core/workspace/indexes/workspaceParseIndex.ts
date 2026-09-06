import {
  analyzeCtnSource,
  reprojectCtnAnalysisPresentation,
  type CtnCanonicalSourceAnalysis,
  createCtnBlockIdRegistry,
  updateCtnBlockIdRegistry,
  type CtnBlockIdRegistry,
  type CtnBlockIdRegistryChange,
  collectCtnInlineReferences,
  ctnGlobalReferenceType,
  normalizeCtnReferenceText,
} from "../../ctn/index.ts";


import type { CtnCompiledSyntax } from "../../ctn/index.ts";
import type { NoteId, WorkspaceNote } from "../model/workspaceData.ts";
import type { WorkspaceStructureIndex } from "./workspaceStructureIndex.ts";

type WorkspaceParseIndexSource = {
  analysisOverrides?: ReadonlyMap<NoteId, CtnCanonicalSourceAnalysis>;
  syntax: CtnCompiledSyntax;
  workspace: WorkspaceStructureIndex;
};

export type ParsedWorkspaceNoteCacheEntry = {
  analysis: CtnCanonicalSourceAnalysis;
  source: string;
  analysisKey: string;
};

export type ParsedWorkspaceNote = {
  analysis: CtnCanonicalSourceAnalysis;
  note: WorkspaceNote;
  source: string;
  syntax: CtnCompiledSyntax;
};

export type WorkspaceParseCache = {
  entriesById: Map<NoteId, ParsedWorkspaceNoteCacheEntry>;
  analysisKey: string;
};

export type NoteReferenceGraphNode = {
  id: NoteId;
  isolated: boolean;
  referencesIn: number;
  referencesOut: number;
  title: string;
};

export type NoteReferenceGraphEdge = {
  count: number;
  id: string;
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  targetTitle: string;
};

export type UnresolvedNoteReference = {
  count: number;
  lineNumber: number;
  sourceNoteId: NoteId;
  targetText: string;
};

export type AmbiguousNoteReference = UnresolvedNoteReference & {
  candidateNoteIds: NoteId[];
};

export type NoteReferenceGraph = {
  ambiguousReferences: AmbiguousNoteReference[];
  edges: NoteReferenceGraphEdge[];
  nodes: NoteReferenceGraphNode[];
  unresolvedReferences: UnresolvedNoteReference[];
};

export type WorkspaceParseIndex = {
  analysisStats: {
    analyzedNoteIds: readonly NoteId[];
    runCount: number;
    updatedBlockIdOwnerIds: readonly NoteId[];
  };
  blockIdRegistry: CtnBlockIdRegistry<NoteId>;
  blockIds: ReadonlySet<string>;
  createScan(): WorkspaceParseScan;
  parseCache: WorkspaceParseCache;
  getParsedNote(noteId: NoteId): ParsedWorkspaceNote | null;
  syntax: CtnCompiledSyntax;
  titleIndex: ReadonlyMap<string, readonly WorkspaceNote[]>;
};

export type WorkspaceParseScan = {
  complete(): NoteReferenceGraph;
  noteIds: readonly NoteId[];
  scanNote(noteId: NoteId): ParsedWorkspaceNote | null;
};

function createParsedWorkspaceNote(
  note: WorkspaceNote,
  syntax: CtnCompiledSyntax,
  analysisKey: string,
  previousCacheEntry: ParsedWorkspaceNoteCacheEntry | undefined,
  analysisOverride: CtnCanonicalSourceAnalysis | undefined,
  onAnalyze: () => void,
): ParsedWorkspaceNote {
  let analysis: CtnCanonicalSourceAnalysis;

  if (
    analysisOverride?.sourceText.source === note.source &&
    analysisOverride.syntax.analysisKey === syntax.analysisKey
  ) {
    analysis = analysisOverride.syntax.presentationKey ===
        syntax.presentationKey
      ? analysisOverride
      : reprojectCtnAnalysisPresentation(analysisOverride, syntax);
  } else if (
    previousCacheEntry?.source === note.source &&
    previousCacheEntry.analysisKey === analysisKey
  ) {
    analysis = previousCacheEntry.analysis.syntax.presentationKey ===
        syntax.presentationKey
      ? previousCacheEntry.analysis
      : reprojectCtnAnalysisPresentation(
          previousCacheEntry.analysis,
          syntax,
        );
  } else {
    onAnalyze();
    analysis = analyzeCtnSource({
      mode: { kind: "canonical-document" },
      source: note.source,
      syntax,
    });
  }

  return {
    analysis,
    note,
    source: note.source,
    syntax,
  };
}

function createParseCacheEntry(
  parsedNote: ParsedWorkspaceNote,
  analysisKey: string,
): ParsedWorkspaceNoteCacheEntry {
  return {
    analysis: parsedNote.analysis,
    source: parsedNote.source,
    analysisKey,
  };
}

function canReuseParseCacheEntry(
  note: WorkspaceNote,
  analysisKey: string,
  cacheEntry: ParsedWorkspaceNoteCacheEntry | undefined,
) {
  return (
    cacheEntry?.source === note.source &&
    cacheEntry.analysisKey === analysisKey
  );
}

function createTitleIndex(notes: WorkspaceNote[]) {
  const titleIndex = new Map<string, WorkspaceNote[]>();

  for (const note of notes) {
    const normalizedTitle = normalizeCtnReferenceText(note.title);
    const current = titleIndex.get(normalizedTitle);

    if (current) {
      current.push(note);
    } else {
      titleIndex.set(normalizedTitle, [note]);
    }
  }

  return titleIndex;
}

function incrementCounter(counters: Map<NoteId, number>, noteId: NoteId) {
  counters.set(noteId, (counters.get(noteId) ?? 0) + 1);
}

type ReferenceGraphNoteSnapshot = {
  id: NoteId;
  source: string;
  title: string;
};

type ReferenceGraphCacheEntry = {
  graph: NoteReferenceGraph;
  notes: ReferenceGraphNoteSnapshot[];
  analysisKey: string;
};

const referenceGraphCacheReader = Symbol("referenceGraphCacheReader");

type WorkspaceParseIndexInternal = WorkspaceParseIndex & {
  [referenceGraphCacheReader](): ReferenceGraphCacheEntry | null;
};

function readReferenceGraphCache(
  index: WorkspaceParseIndex,
): ReferenceGraphCacheEntry | null {
  const reader = (index as Partial<WorkspaceParseIndexInternal>)[
    referenceGraphCacheReader
  ];

  return reader?.() ?? null;
}

function createReferenceGraphNoteSnapshot(
  notes: WorkspaceNote[],
): ReferenceGraphNoteSnapshot[] {
  return notes.map((note) => ({
    id: note.id,
    source: note.source,
    title: note.title,
  }));
}

function canReuseReferenceGraph(
  cacheEntry: ReferenceGraphCacheEntry | null,
  notes: WorkspaceNote[],
  analysisKey: string,
): boolean {
  if (
    !cacheEntry ||
    cacheEntry.analysisKey !== analysisKey ||
    cacheEntry.notes.length !== notes.length
  ) {
    return false;
  }

  return cacheEntry.notes.every((cachedNote, index) => {
    const note = notes[index];

    if (!note) {
      return false;
    }

    return (
      cachedNote.id === note.id &&
      cachedNote.source === note.source &&
      cachedNote.title === note.title
    );
  });
}

function createWorkspaceNoteReferenceGraphBuilder(
  notes: WorkspaceNote[],
  titleIndex: ReadonlyMap<string, readonly WorkspaceNote[]>,
) {
  const referencesIn = new Map<NoteId, number>();
  const referencesOut = new Map<NoteId, number>();
  const edgeCounts = new Map<string, NoteReferenceGraphEdge>();
  const ambiguousCounts = new Map<string, AmbiguousNoteReference>();
  const unresolvedCounts = new Map<string, UnresolvedNoteReference>();

  const addParsedNote = (parsedNote: ParsedWorkspaceNote) => {
    for (const reference of collectCtnInlineReferences(
      parsedNote.analysis.document,
      ctnGlobalReferenceType,
    )) {
      const targetText = normalizeCtnReferenceText(reference.text);

      if (!targetText) {
        continue;
      }

      const targetNotes = titleIndex.get(targetText);

      if (!targetNotes || targetNotes.length === 0) {
        const unresolvedKey = `${parsedNote.note.id}->${targetText}`;
        const current = unresolvedCounts.get(unresolvedKey);

        unresolvedCounts.set(unresolvedKey, {
          count: (current?.count ?? 0) + 1,
          lineNumber: Math.min(
            current?.lineNumber ?? reference.lineNumber,
            reference.lineNumber,
          ),
          sourceNoteId: parsedNote.note.id,
          targetText,
        });
        incrementCounter(referencesOut, parsedNote.note.id);
        continue;
      }

      if (targetNotes.length > 1) {
        const ambiguousKey = `${parsedNote.note.id}->${targetText}`;
        const current = ambiguousCounts.get(ambiguousKey);

        ambiguousCounts.set(ambiguousKey, {
          candidateNoteIds: targetNotes.map((note) => note.id),
          count: (current?.count ?? 0) + 1,
          lineNumber: Math.min(
            current?.lineNumber ?? reference.lineNumber,
            reference.lineNumber,
          ),
          sourceNoteId: parsedNote.note.id,
          targetText,
        });
        incrementCounter(referencesOut, parsedNote.note.id);
        continue;
      }

      const targetNote = targetNotes[0];
      const edgeKey = `${parsedNote.note.id}->${targetNote.id}->${targetText}`;
      const current = edgeCounts.get(edgeKey);

      edgeCounts.set(edgeKey, {
        count: (current?.count ?? 0) + 1,
        id: edgeKey,
        sourceNoteId: parsedNote.note.id,
        targetNoteId: targetNote.id,
        targetTitle: targetText,
      });
      incrementCounter(referencesOut, parsedNote.note.id);
      incrementCounter(referencesIn, targetNote.id);
    }
  };

  return {
    addParsedNote,
    complete(): NoteReferenceGraph {
      return {
        ambiguousReferences: [...ambiguousCounts.values()],
        edges: [...edgeCounts.values()],
        nodes: notes.map((note) => {
          const noteReferencesIn = referencesIn.get(note.id) ?? 0;
          const noteReferencesOut = referencesOut.get(note.id) ?? 0;

          return {
            id: note.id,
            isolated: noteReferencesIn === 0 && noteReferencesOut === 0,
            referencesIn: noteReferencesIn,
            referencesOut: noteReferencesOut,
            title: note.title,
          };
        }),
        unresolvedReferences: [...unresolvedCounts.values()],
      };
    },
  };
}

export function createWorkspaceParseIndex(
  source: WorkspaceParseIndexSource,
  previousIndex?: WorkspaceParseIndex | null,
): WorkspaceParseIndex {
  const analysisKey = source.syntax.analysisKey;
  const notes = source.workspace.data.notes.map((note) => {
    const entry = source.workspace.noteEntryById.get(note.id);

    if (!entry) {
      throw new Error(`Workspace note is missing from tree: ${note.id}`);
    }

    return entry.projectedNote;
  });
  const titleIndex = createTitleIndex(notes);
  const parseCacheEntries = new Map<NoteId, ParsedWorkspaceNoteCacheEntry>(
    notes.flatMap(
      (note): [NoteId, ParsedWorkspaceNoteCacheEntry][] => {
        const previousCacheEntry = previousIndex?.parseCache.entriesById.get(
          note.id,
        );

        if (
          !previousCacheEntry ||
          !canReuseParseCacheEntry(note, analysisKey, previousCacheEntry)
        ) {
          return [];
        }

        return [[note.id, previousCacheEntry]];
      },
    ),
  );
  const previousReferenceGraphCache = previousIndex
    ? readReferenceGraphCache(previousIndex)
    : null;
  const analyzedNoteIds: NoteId[] = [];
  let ownedReferenceGraphCache: ReferenceGraphCacheEntry | null = null;
  const resolveParsedNote = (note: WorkspaceNote): ParsedWorkspaceNote => {
    const currentCacheEntry = parseCacheEntries.get(note.id);
    const parsedNote = createParsedWorkspaceNote(
      note,
      source.syntax,
      analysisKey,
      currentCacheEntry,
      source.analysisOverrides?.get(note.id),
      () => analyzedNoteIds.push(note.id),
    );

    parseCacheEntries.set(
      note.id,
      createParseCacheEntry(parsedNote, analysisKey),
    );

    return parsedNote;
  };
  const parsedNotes = notes.map(resolveParsedNote);
  const parsedNoteById = new Map(
    parsedNotes.map((parsedNote) => [parsedNote.note.id, parsedNote]),
  );
  const canUpdateBlockIdRegistry =
    previousIndex?.syntax.blockGrammarKey ===
      source.syntax.blockGrammarKey;
  const updatedBlockIdOwnerIds: NoteId[] = [];
  let blockIdRegistry: CtnBlockIdRegistry<NoteId>;

  if (previousIndex && canUpdateBlockIdRegistry) {
    const currentNoteIds = new Set(notes.map((note) => note.id));
    const changes: CtnBlockIdRegistryChange<NoteId>[] = [];

    for (const ownerId of previousIndex.blockIdRegistry.blockIdsByOwner.keys()) {
      if (!currentNoteIds.has(ownerId)) {
        changes.push({ entry: null, ownerId });
        updatedBlockIdOwnerIds.push(ownerId);
      }
    }
    for (const parsedNote of parsedNotes) {
      const previousCacheEntry =
        previousIndex.parseCache.entriesById.get(parsedNote.note.id);

      if (
        !previousCacheEntry ||
        previousCacheEntry.source !== parsedNote.source
      ) {
        changes.push({
          entry: {
            analysis: parsedNote.analysis,
            ownerId: parsedNote.note.id,
          },
          ownerId: parsedNote.note.id,
        });
        updatedBlockIdOwnerIds.push(parsedNote.note.id);
      }
    }
    blockIdRegistry = updateCtnBlockIdRegistry(
      previousIndex.blockIdRegistry,
      changes,
    );
  } else {
    updatedBlockIdOwnerIds.push(...parsedNotes.map(({ note }) => note.id));
    blockIdRegistry = createCtnBlockIdRegistry(
      parsedNotes.map(({ analysis, note }) => ({
        analysis,
        ownerId: note.id,
      })),
    );
  }
  const getReusableReferenceGraph = () => {
    if (
      previousReferenceGraphCache &&
      canReuseReferenceGraph(
        previousReferenceGraphCache,
        notes,
        analysisKey,
      )
    ) {
      return previousReferenceGraphCache.graph;
    }

    return null;
  };
  const commitReferenceGraph = (graph: NoteReferenceGraph) => {
    ownedReferenceGraphCache ??= {
      graph,
      notes: createReferenceGraphNoteSnapshot(notes),
      analysisKey,
    };

    return ownedReferenceGraphCache.graph;
  };
  const createScan = (): WorkspaceParseScan => {
    const reusableReferenceGraph = getReusableReferenceGraph();
    const graphBuilder = reusableReferenceGraph
      ? null
      : createWorkspaceNoteReferenceGraphBuilder(notes, titleIndex);
    const scannedNoteIds = new Set<NoteId>();

    return {
      complete() {
        if (scannedNoteIds.size !== notes.length) {
          throw new Error("Workspace parse scan is incomplete.");
        }

        return commitReferenceGraph(
          reusableReferenceGraph ?? graphBuilder!.complete(),
        );
      },
      noteIds: notes.map((note) => note.id),
      scanNote(noteId) {
        const parsedNote = parsedNoteById.get(noteId);

        if (!parsedNote) {
          return null;
        }

        if (!scannedNoteIds.has(noteId)) {
          scannedNoteIds.add(noteId);
          graphBuilder?.addParsedNote(parsedNote);
        }

        return parsedNote;
      },
    };
  };

  const index: WorkspaceParseIndexInternal = {
    [referenceGraphCacheReader]: () => ownedReferenceGraphCache,
    analysisStats: {
      analyzedNoteIds,
      runCount: analyzedNoteIds.length,
      updatedBlockIdOwnerIds,
    },
    blockIdRegistry,
    blockIds: blockIdRegistry.blockIds,
    createScan,
    parseCache: {
      entriesById: parseCacheEntries,
      analysisKey,
    },
    getParsedNote(noteId) {
      return parsedNoteById.get(noteId) ?? null;
    },
    syntax: source.syntax,
    titleIndex,
  };

  return index;
}
