import type { NoteId, NoteRecord, NoteWorkspace } from "../domain/notes";
import { extractCtnInlineReferences } from "../ctn-parser/references";
import { resolveWorkspaceSyntaxProfile } from "./syntaxResolution";

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

export type NoteReferenceGraphIssue = {
  message: string;
  noteId: NoteId;
};

export type NoteReferenceGraph = {
  edges: NoteReferenceGraphEdge[];
  issues: NoteReferenceGraphIssue[];
  nodes: NoteReferenceGraphNode[];
  unresolvedReferences: UnresolvedNoteReference[];
};

function normalizeReferenceText(text: string) {
  return text.trim().replace(/\s+/g, " ");
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

export function createNoteReferenceGraph(
  workspace: NoteWorkspace,
): NoteReferenceGraph {
  const syntaxResolution = resolveWorkspaceSyntaxProfile(workspace);
  const titleIndex = createTitleIndex(workspace.notes);
  const referencesIn = new Map<NoteId, number>();
  const referencesOut = new Map<NoteId, number>();
  const edgeCounts = new Map<string, NoteReferenceGraphEdge>();
  const unresolvedCounts = new Map<string, UnresolvedNoteReference>();

  if (syntaxResolution.status !== "resolved") {
    return {
      edges: [],
      issues: workspace.notes.map((note) => ({
        message: syntaxResolution.message,
        noteId: note.id,
      })),
      nodes: workspace.notes.map((note) => ({
        id: note.id,
        isolated: true,
        referencesIn: 0,
        referencesOut: 0,
        title: note.title,
      })),
      unresolvedReferences: [],
    };
  }

  for (const note of workspace.notes) {
    for (const reference of extractCtnInlineReferences(
      note.source,
      syntaxResolution.profile,
      "global-reference",
    )) {
      const targetText = normalizeReferenceText(reference.text);

      if (!targetText) {
        continue;
      }

      const targetNotes = titleIndex.get(targetText);

      if (!targetNotes || targetNotes.length === 0) {
        const unresolvedKey = `${note.id}->${targetText}`;
        const current = unresolvedCounts.get(unresolvedKey);

        unresolvedCounts.set(unresolvedKey, {
          count: (current?.count ?? 0) + 1,
          sourceNoteId: note.id,
          targetText,
        });
        incrementCounter(referencesOut, note.id);
        continue;
      }

      for (const targetNote of targetNotes) {
        const edgeKey = `${note.id}->${targetNote.id}->${targetText}`;
        const current = edgeCounts.get(edgeKey);

        edgeCounts.set(edgeKey, {
          count: (current?.count ?? 0) + 1,
          id: edgeKey,
          sourceNoteId: note.id,
          targetNoteId: targetNote.id,
          targetTitle: targetText,
        });
        incrementCounter(referencesOut, note.id);
        incrementCounter(referencesIn, targetNote.id);
      }
    }
  }

  const edges = [...edgeCounts.values()];
  const nodes = workspace.notes.map((note) => {
    const noteReferencesIn = referencesIn.get(note.id) ?? 0;
    const noteReferencesOut = referencesOut.get(note.id) ?? 0;

    return {
      id: note.id,
      isolated: noteReferencesIn === 0 && noteReferencesOut === 0,
      referencesIn: noteReferencesIn,
      referencesOut: noteReferencesOut,
      title: note.title,
    };
  });

  return {
    edges,
    issues: [],
    nodes,
    unresolvedReferences: [...unresolvedCounts.values()],
  };
}
