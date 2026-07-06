import {
  defaultFolderId,
  type NoteRecord,
  type NoteTreeNode,
} from "../../../workspace/model/workspaceData";

export type UiFolderId = string;
export type UiNoteId = string;

export type UiTreeNode =
  | {
      canDrag: boolean;
      childCount: number;
      children: UiTreeNode[];
      folderId: UiFolderId;
      id: string;
      kind: "folder";
      parentFolderId: UiFolderId | null;
      title: string;
    }
  | {
      canDrag: boolean;
      folderId: UiFolderId | null;
      id: string;
      kind: "note";
      noteId: UiNoteId;
      parentFolderId: UiFolderId | null;
      title: string;
    };

export type UiNoteSummary = {
  id: UiNoteId;
  title: string;
};
export type UiTreeNodeReference =
  | {
      folderId: UiFolderId;
      kind: "folder";
      parentFolderId: UiFolderId | null;
    }
  | {
      kind: "note";
      noteId: UiNoteId;
      parentFolderId: UiFolderId | null;
    };
export type UiTreeMovePlacement = "after" | "before" | "inside";
export type UiTreeMoveRequest = {
  placement: UiTreeMovePlacement;
  source: UiTreeNodeReference;
  target: UiTreeNodeReference;
};

function collectWorkspaceTreeNoteIds(
  nodes: NoteTreeNode[],
  noteIds = new Set<string>(),
  visitedNodeIds = new Set<string>(),
) {
  nodes.forEach((node) => {
    if (visitedNodeIds.has(node.id)) {
      return;
    }

    visitedNodeIds.add(node.id);

    if (node.kind === "note") {
      noteIds.add(node.noteId);
      return;
    }

    collectWorkspaceTreeNoteIds(node.children, noteIds, visitedNodeIds);
  });

  return noteIds;
}

function createNoteMap(notes: Pick<NoteRecord, "id" | "title">[]) {
  return new Map(notes.map((note) => [note.id, note]));
}

function createUiNoteTreeNodes({
  folderId,
  noteMap,
  nodes,
  visitedNodeIds = new Set<string>(),
}: {
  folderId: string | null;
  noteMap: Map<string, Pick<NoteRecord, "id" | "title">>;
  nodes: NoteTreeNode[];
  visitedNodeIds?: Set<string>;
}): UiTreeNode[] {
  return nodes.flatMap<UiTreeNode>((node) => {
    if (visitedNodeIds.has(node.id)) {
      return [];
    }

    visitedNodeIds.add(node.id);

    if (node.kind === "note") {
      const note = noteMap.get(node.noteId);

      return note
        ? [
            {
              canDrag: Boolean(folderId),
              folderId,
              id: node.id,
              kind: "note" as const,
              noteId: note.id,
              parentFolderId: folderId,
              title: note.title,
            },
          ]
        : [];
    }

    const children = createUiNoteTreeNodes({
      folderId: node.id,
      noteMap,
      nodes: node.children,
      visitedNodeIds,
    });

    if (node.id === defaultFolderId) {
      return children;
    }

    return [
      {
        canDrag: node.id !== defaultFolderId,
        childCount: node.children.length,
        children,
        folderId: node.id,
        id: node.id,
        kind: "folder" as const,
        parentFolderId: folderId,
        title: node.title,
      },
    ];
  });
}

export function createUiNoteTree({
  includeOrphans = false,
  notes,
  tree,
}: {
  includeOrphans?: boolean;
  notes: Pick<NoteRecord, "id" | "title">[];
  tree: NoteTreeNode[];
}): UiTreeNode[] {
  const noteMap = createNoteMap(notes);
  const treeNoteIds = collectWorkspaceTreeNoteIds(tree);
  const nodes = includeOrphans
    ? [
        ...tree,
        ...notes
          .filter((note) => !treeNoteIds.has(note.id))
          .map(
            (note): NoteTreeNode => ({
              id: `workspace-orphan-${note.id}`,
              kind: "note",
              noteId: note.id,
            }),
          ),
      ]
    : tree;

  return createUiNoteTreeNodes({
    folderId: null,
    noteMap,
    nodes,
  });
}

export function createUiNoteSummaries(
  notes: Pick<NoteRecord, "id" | "title">[],
): UiNoteSummary[] {
  return notes.map((note) => ({
    id: note.id,
    title: note.title,
  }));
}
