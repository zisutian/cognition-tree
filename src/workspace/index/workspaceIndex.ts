import { collectCtnInlineReferences } from "../../ctn-parser/references";
import { parseCtnDocument } from "../../ctn-parser/parseCtnDocument";
import type { CtnDocument } from "../../ctn-parser/types";
import type { CtnSyntaxProfile } from "../../ctn-syntax/types";
import type { NoteId, NoteRecord } from "../model/workspaceData";

type WorkspaceIndexSource = {
  notes: NoteRecord[];
  syntaxProfile: CtnSyntaxProfile;
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
  parsedNotesById: Map<NoteId, ParsedWorkspaceNote>;
  referenceGraph: NoteReferenceGraph;
  syntaxProfile: CtnSyntaxProfile;
};

function normalizeReferenceText(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function createParsedWorkspaceNote(
  note: NoteRecord,
  syntaxProfile: CtnSyntaxProfile,
): ParsedWorkspaceNote {
  return {
    document: parseCtnDocument(note.source, syntaxProfile),
    note,
    profile: syntaxProfile,
    source: note.source,
  };
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

function createWorkspaceNoteReferenceGraphIndex(
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
): WorkspaceIndex {
  const parsedNotes = workspace.notes.map((note) =>
    createParsedWorkspaceNote(note, workspace.syntaxProfile),
  );
  const parsedNoteEntries = parsedNotes.flatMap(
    (parsedNote): [NoteId, ParsedWorkspaceNote][] =>
      parsedNote.note ? [[parsedNote.note.id, parsedNote]] : [],
  );

  return {
    parsedNotesById: new Map(parsedNoteEntries),
    referenceGraph: createWorkspaceNoteReferenceGraphIndex(parsedNotes),
    syntaxProfile: workspace.syntaxProfile,
  };
}
