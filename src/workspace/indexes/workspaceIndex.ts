import { collectCtnInlineReferences } from "../../ctn/parser/inlineReferences";
import { parseCtnDocument } from "../../ctn/parser/parseCtnDocument";
import type { CtnDocument } from "../../ctn/parser/types";
import { createCtnSyntaxParseProfileKey } from "../../ctn/syntax/profileKey";
import type { CtnSyntaxProfile } from "../../ctn/syntax/types";
import type { NoteId, NoteRecord } from "../model/workspaceData";

type WorkspaceIndexSource = {
  notes: NoteRecord[];
  syntaxProfile: CtnSyntaxProfile;
};

export type ParsedWorkspaceNoteCacheEntry = {
  document: CtnDocument;
  source: string;
  syntaxProfileKey: string;
};

export const emptyCtnDocument: CtnDocument = {
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
  sourceNoteId: NoteId;
  targetText: string;
};

export type NoteReferenceGraph = {
  edges: NoteReferenceGraphEdge[];
  nodes: NoteReferenceGraphNode[];
  unresolvedReferences: UnresolvedNoteReference[];
};

export type WorkspaceIndex = {
  parseCache: WorkspaceParseCache;
  getParsedNote(noteId: NoteId): ParsedWorkspaceNote | null;
  readonly referenceGraph: NoteReferenceGraph;
  syntaxProfile: CtnSyntaxProfile;
};

export type WorkspaceIndexCache = {
  resolve(workspace: WorkspaceIndexSource): WorkspaceIndex;
};

function normalizeReferenceText(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

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
    const normalizedTitle = normalizeReferenceText(note.title);
    const current = titleIndex.get(normalizedTitle) ?? [];

    titleIndex.set(normalizedTitle, [...current, note]);
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
  WorkspaceIndex,
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

function buildWorkspaceNoteReferenceGraph(
  parsedNotes: ParsedWorkspaceNote[],
): NoteReferenceGraph {
  const notes = parsedNotes.flatMap((parsedNote) =>
    parsedNote.note ? [parsedNote.note] : [],
  );
  const titleIndex = createTitleIndex(notes);
  const referencesIn = new Map<NoteId, number>();
  const referencesOut = new Map<NoteId, number>();
  const edgeCounts = new Map<string, NoteReferenceGraphEdge>();
  const unresolvedCounts = new Map<string, UnresolvedNoteReference>();

  for (const parsedNote of parsedNotes) {
    if (!parsedNote.note) {
      continue;
    }

    for (const reference of collectCtnInlineReferences(
      parsedNote.document,
      "global-reference",
    )) {
      const targetText = normalizeReferenceText(reference.text);

      if (!targetText) {
        continue;
      }

      const targetNotes = titleIndex.get(targetText);

      if (!targetNotes || targetNotes.length === 0) {
        const unresolvedKey = `${parsedNote.note.id}->${targetText}`;
        const current = unresolvedCounts.get(unresolvedKey);

        unresolvedCounts.set(unresolvedKey, {
          count: (current?.count ?? 0) + 1,
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
  }

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
}

export function createWorkspaceIndex(
  workspace: WorkspaceIndexSource,
  previousIndex?: WorkspaceIndex | null,
): WorkspaceIndex {
  const syntaxProfileKey = createCtnSyntaxParseProfileKey(
    workspace.syntaxProfile,
  );
  const notesById = new Map(workspace.notes.map((note) => [note.id, note]));
  const parseCacheEntries = new Map<NoteId, ParsedWorkspaceNoteCacheEntry>(
    workspace.notes.flatMap(
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
      workspace.syntaxProfile,
      syntaxProfileKey,
      previousCacheEntry,
    );

    parseCacheEntries.set(
      note.id,
      createParseCacheEntry(parsedNote, syntaxProfileKey),
    );

    return parsedNote;
  };
  const createReferenceGraph = () => {
    if (
      previousReferenceGraphCache &&
      canReuseReferenceGraph(
        previousReferenceGraphCache,
        workspace.notes,
        syntaxProfileKey,
      )
    ) {
      return previousReferenceGraphCache.graph;
    }

    return buildWorkspaceNoteReferenceGraph(
      workspace.notes.map(resolveParsedNote),
    );
  };

  const index: WorkspaceIndex = {
    parseCache: {
      entriesById: parseCacheEntries,
      syntaxProfileKey,
    },
    getParsedNote(noteId) {
      const note = notesById.get(noteId);

      return note ? resolveParsedNote(note) : null;
    },
    get referenceGraph() {
      referenceGraph ??= createReferenceGraph();
      referenceGraphCacheByIndex.set(index, {
        graph: referenceGraph,
        notes: createReferenceGraphNoteSnapshot(workspace.notes),
        syntaxProfileKey,
      });

      return referenceGraph;
    },
    syntaxProfile: workspace.syntaxProfile,
  };

  return index;
}

export function createWorkspaceIndexCache(): WorkspaceIndexCache {
  let previousIndex: WorkspaceIndex | null = null;

  return {
    resolve(workspace) {
      previousIndex = createWorkspaceIndex(workspace, previousIndex);

      return previousIndex;
    },
  };
}
