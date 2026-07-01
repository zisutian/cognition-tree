import type { NoteId, NoteRecord, NoteWorkspace } from "../domain/notes";
import type {
  CtnInlineRule,
  CtnPairedInlineRule,
  CtnSyntaxProfile,
} from "../syntax/types";
import { resolveNoteSyntaxProfile } from "./syntaxResolution";

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

function isGlobalReferenceRule(
  rule: CtnInlineRule,
): rule is CtnPairedInlineRule {
  return rule.kind === "paired" && rule.type === "global-reference";
}

function getGlobalReferenceRule(
  syntaxProfile: CtnSyntaxProfile,
): CtnPairedInlineRule | null {
  return syntaxProfile.inlineRules.find(isGlobalReferenceRule) ?? null;
}

function extractGlobalReferenceTexts(
  source: string,
  syntaxProfile: CtnSyntaxProfile,
) {
  const rule = getGlobalReferenceRule(syntaxProfile);

  if (!rule) {
    return [];
  }

  const references: string[] = [];
  let index = 0;

  while (index < source.length) {
    const openIndex = source.indexOf(rule.open, index);

    if (openIndex < 0) {
      break;
    }

    const textStartIndex = openIndex + rule.open.length;
    const closeIndex = source.indexOf(rule.close, textStartIndex);

    if (closeIndex < 0) {
      break;
    }

    references.push(source.slice(textStartIndex, closeIndex));
    index = closeIndex + rule.close.length;
  }

  return references;
}

export function createNoteReferenceGraph(
  workspace: NoteWorkspace,
): NoteReferenceGraph {
  const titleIndex = createTitleIndex(workspace.notes);
  const referencesIn = new Map<NoteId, number>();
  const referencesOut = new Map<NoteId, number>();
  const edgeCounts = new Map<string, NoteReferenceGraphEdge>();
  const unresolvedCounts = new Map<string, UnresolvedNoteReference>();
  const issues: NoteReferenceGraphIssue[] = [];

  for (const note of workspace.notes) {
    const syntaxResolution = resolveNoteSyntaxProfile(workspace, note);

    if (syntaxResolution.status !== "resolved") {
      issues.push({
        message: syntaxResolution.message,
        noteId: note.id,
      });
      continue;
    }

    for (const referenceText of extractGlobalReferenceTexts(
      note.source,
      syntaxResolution.profile,
    )) {
      const targetText = normalizeReferenceText(referenceText);

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
    issues,
    nodes,
    unresolvedReferences: [...unresolvedCounts.values()],
  };
}
