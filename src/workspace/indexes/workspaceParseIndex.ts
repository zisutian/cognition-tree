import {
  collectCtnInlineReferences,
  ctnGlobalReferenceType,
  normalizeCtnReferenceText,
} from "../../ctn/parser/inlineReferences";
import { parseCtnDocument } from "../../ctn/parser/parseCtnDocument";
import type { CtnDocument } from "../../ctn/parser/types";
import { createCtnSyntaxParseProfileKey } from "../../ctn/syntax/profileKey";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
import type { NoteId, NoteRecord } from "../model/workspaceData";
import type { WorkspaceStructureIndex } from "./workspaceStructureIndex";

type WorkspaceParseIndexSource = {
  syntaxProfile: CtnSyntaxProfile;
  workspace: WorkspaceStructureIndex;
};

export type ParsedWorkspaceNoteCacheEntry = {
  document: CtnDocument;
  source: string;
  syntaxProfileKey: string;
};

const emptyCtnDocument: CtnDocument = {
  blocks: [],
  diagnostics: [],
  roots: [],
};

export type ParsedWorkspaceNote = {
  document: CtnDocument;
  note: NoteRecord | null;
  profile: CtnSyntaxProfile;
  source: string;
};

export type WorkspaceParseCache = {
  entriesById: Map<NoteId, ParsedWorkspaceNoteCacheEntry>;
  syntaxProfileKey: string;
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

export type NoteReferenceGraph = {
  edges: NoteReferenceGraphEdge[];
  nodes: NoteReferenceGraphNode[];
  unresolvedReferences: UnresolvedNoteReference[];
};

export type WorkspaceParseIndex = {
  createScan(): WorkspaceParseScan;
  parseCache: WorkspaceParseCache;
  getParsedNote(noteId: NoteId): ParsedWorkspaceNote | null;
  readonly referenceGraph: NoteReferenceGraph;
  syntaxProfile: CtnSyntaxProfile;
};

export type WorkspaceParseScan = {
  complete(): NoteReferenceGraph;
  noteIds: readonly NoteId[];
  scanNote(noteId: NoteId): ParsedWorkspaceNote | null;
};

export type WorkspaceParseIndexCache = {
  resolve(source: WorkspaceParseIndexSource): WorkspaceParseIndex;
};

function createParsedWorkspaceNote(
  note: NoteRecord,
  syntaxProfile: CtnSyntaxProfile,
  syntaxProfileKey: string,
  previousCacheEntry: ParsedWorkspaceNoteCacheEntry | undefined,
): ParsedWorkspaceNote {
  const document =
    previousCacheEntry?.source === note.source &&
    previousCacheEntry.syntaxProfileKey === syntaxProfileKey
      ? previousCacheEntry.document
      : parseCtnDocument(note.source, syntaxProfile);

  return {
    document,
    note,
    profile: syntaxProfile,
    source: note.source,
  };
}

function createParseCacheEntry(
  parsedNote: ParsedWorkspaceNote,
  syntaxProfileKey: string,
): ParsedWorkspaceNoteCacheEntry {
  return {
    document: parsedNote.document,
    source: parsedNote.source,
    syntaxProfileKey,
  };
}

function canReuseParseCacheEntry(
  note: NoteRecord,
  syntaxProfileKey: string,
  cacheEntry: ParsedWorkspaceNoteCacheEntry | undefined,
) {
  return (
    cacheEntry?.source === note.source &&
    cacheEntry.syntaxProfileKey === syntaxProfileKey
  );
}

export function createEmptyParsedWorkspaceNote(
  syntaxProfile: CtnSyntaxProfile,
): ParsedWorkspaceNote {
  return {
    document: emptyCtnDocument,
    note: null,
    profile: syntaxProfile,
    source: "",
  };
}

function createTitleIndex(notes: NoteRecord[]) {
  const titleIndex = new Map<string, NoteRecord[]>();

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
  syntaxProfileKey: string;
};

const referenceGraphCacheByIndex = new WeakMap<
  WorkspaceParseIndex,
  ReferenceGraphCacheEntry
>();

function createReferenceGraphNoteSnapshot(
  notes: NoteRecord[],
): ReferenceGraphNoteSnapshot[] {
  return notes.map((note) => ({
    id: note.id,
    source: note.source,
    title: note.title,
  }));
}

function canReuseReferenceGraph(
  cacheEntry: ReferenceGraphCacheEntry | null,
  notes: NoteRecord[],
  syntaxProfileKey: string,
): boolean {
  if (
    !cacheEntry ||
    cacheEntry.syntaxProfileKey !== syntaxProfileKey ||
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

function createWorkspaceNoteReferenceGraphBuilder(notes: NoteRecord[]) {
  const titleIndex = createTitleIndex(notes);
  const referencesIn = new Map<NoteId, number>();
  const referencesOut = new Map<NoteId, number>();
  const edgeCounts = new Map<string, NoteReferenceGraphEdge>();
  const unresolvedCounts = new Map<string, UnresolvedNoteReference>();

  const addParsedNote = (parsedNote: ParsedWorkspaceNote) => {
    if (!parsedNote.note) {
      return;
    }

    for (const reference of collectCtnInlineReferences(
      parsedNote.document,
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

      for (const targetNote of targetNotes) {
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
    }
  };

  return {
    addParsedNote,
    complete(): NoteReferenceGraph {
      return {
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
  const syntaxProfileKey = createCtnSyntaxParseProfileKey(
    source.syntaxProfile,
  );
  const notes = source.workspace.data.notes;
  const parseCacheEntries = new Map<NoteId, ParsedWorkspaceNoteCacheEntry>(
    notes.flatMap(
      (note): [NoteId, ParsedWorkspaceNoteCacheEntry][] => {
        const previousCacheEntry = previousIndex?.parseCache.entriesById.get(
          note.id,
        );

        if (
          !previousCacheEntry ||
          !canReuseParseCacheEntry(note, syntaxProfileKey, previousCacheEntry)
        ) {
          return [];
        }

        return [[note.id, previousCacheEntry]];
      },
    ),
  );
  const previousReferenceGraphCache = previousIndex
    ? referenceGraphCacheByIndex.get(previousIndex) ?? null
    : null;
  let referenceGraph: NoteReferenceGraph | null = null;
  const resolveParsedNote = (note: NoteRecord): ParsedWorkspaceNote => {
    const currentCacheEntry = parseCacheEntries.get(note.id);
    const previousCacheEntry =
      currentCacheEntry ?? previousIndex?.parseCache.entriesById.get(note.id);
    const parsedNote = createParsedWorkspaceNote(
      note,
      source.syntaxProfile,
      syntaxProfileKey,
      previousCacheEntry,
    );

    parseCacheEntries.set(
      note.id,
      createParseCacheEntry(parsedNote, syntaxProfileKey),
    );

    return parsedNote;
  };
  const getReusableReferenceGraph = () => {
    if (
      previousReferenceGraphCache &&
      canReuseReferenceGraph(
        previousReferenceGraphCache,
        notes,
        syntaxProfileKey,
      )
    ) {
      return previousReferenceGraphCache.graph;
    }

    return null;
  };
  const commitReferenceGraph = (graph: NoteReferenceGraph) => {
    referenceGraph ??= graph;
    referenceGraphCacheByIndex.set(index, {
      graph: referenceGraph,
      notes: createReferenceGraphNoteSnapshot(notes),
      syntaxProfileKey,
    });

    return referenceGraph;
  };
  const createScan = (): WorkspaceParseScan => {
    const reusableReferenceGraph = getReusableReferenceGraph();
    const graphBuilder = reusableReferenceGraph
      ? null
      : createWorkspaceNoteReferenceGraphBuilder(notes);
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
        const note = source.workspace.noteById.get(noteId);

        if (!note) {
          return null;
        }

        const parsedNote = resolveParsedNote(note);

        if (!scannedNoteIds.has(noteId)) {
          scannedNoteIds.add(noteId);
          graphBuilder?.addParsedNote(parsedNote);
        }

        return parsedNote;
      },
    };
  };

  const index: WorkspaceParseIndex = {
    createScan,
    parseCache: {
      entriesById: parseCacheEntries,
      syntaxProfileKey,
    },
    getParsedNote(noteId) {
      const note = source.workspace.noteById.get(noteId);

      return note ? resolveParsedNote(note) : null;
    },
    get referenceGraph() {
      if (!referenceGraph) {
        const scan = createScan();

        scan.noteIds.forEach((noteId) => scan.scanNote(noteId));
        referenceGraph = scan.complete();
      }

      return referenceGraph;
    },
    syntaxProfile: source.syntaxProfile,
  };

  return index;
}

export function createWorkspaceParseIndexCache(): WorkspaceParseIndexCache {
  let previousIndex: WorkspaceParseIndex | null = null;
  let previousSource: WorkspaceParseIndexSource | null = null;

  return {
    resolve(source) {
      if (
        previousIndex &&
        previousSource?.syntaxProfile === source.syntaxProfile &&
        previousSource.workspace === source.workspace
      ) {
        return previousIndex;
      }

      previousIndex = createWorkspaceParseIndex(source, previousIndex);
      previousSource = source;

      return previousIndex;
    },
  };
}
