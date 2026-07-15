import type {
  NoteRecord,
  NoteTreeNode,
} from "../../../workspace/model/workspaceData";

export type UiFolderId = string;
export type UiNoteId = string;

export type UiDirectoryActiveNode =
  | {
      folderId: UiFolderId;
      kind: "folder";
    }
  | {
      kind: "note";
      noteId: UiNoteId;
    };

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
export type UiTreeMoveDestination =
  | {
      kind: "root";
    }
  | {
      folderId: UiFolderId;
      kind: "inside";
    }
  | {
      kind: "after" | "before";
      target: UiTreeNodeReference;
    };
export type UiTreeMoveRequest = {
  destination: UiTreeMoveDestination;
  source: UiTreeNodeReference;
};

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
              canDrag: true,
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

    return [
      {
        canDrag: true,
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
  notes,
  tree,
}: {
  notes: Pick<NoteRecord, "id" | "title">[];
  tree: NoteTreeNode[];
}): UiTreeNode[] {
  const noteMap = createNoteMap(notes);

  return createUiNoteTreeNodes({
    folderId: null,
    noteMap,
    nodes: tree,
  });
}
