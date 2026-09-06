import type {
  NoteTreeNode,
  WorkspaceNote,
} from "../../../core/workspace/index.ts";

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

function createNoteMap(notes: Pick<WorkspaceNote, "id" | "title">[]) {
  return new Map(notes.map((note) => [note.id, note]));
}

type PendingProjection = {
  node: NoteTreeNode;
  parentFolderId: string | null;
  visited: boolean;
};

function createUiNoteTreeNodes({
  noteMap,
  nodes,
}: {
  noteMap: Map<string, Pick<WorkspaceNote, "id" | "title">>;
  nodes: NoteTreeNode[];
}): UiTreeNode[] {
  const projectedByNode = new Map<NoteTreeNode, UiTreeNode>();
  const pending: PendingProjection[] = [];

  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    pending.push({
      node: nodes[index],
      parentFolderId: null,
      visited: false,
    });
  }

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) {
      continue;
    }

    if (current.node.kind === "note") {
      const note = noteMap.get(current.node.noteId);

      if (!note) {
        throw new Error(
          `Workspace tree references unknown note: ${current.node.noteId}`,
        );
      }

      projectedByNode.set(current.node, {
        canDrag: true,
        folderId: current.parentFolderId,
        id: `note:${current.node.noteId}`,
        kind: "note",
        noteId: current.node.noteId,
        parentFolderId: current.parentFolderId,
        title: note.title,
      });
      continue;
    }

    if (!current.visited) {
      pending.push({ ...current, visited: true });

      for (
        let index = current.node.children.length - 1;
        index >= 0;
        index -= 1
      ) {
        pending.push({
          node: current.node.children[index],
          parentFolderId: current.node.folderId,
          visited: false,
        });
      }
      continue;
    }

    const children = current.node.children.map((child) => {
      const projected = projectedByNode.get(child);

      if (!projected) {
        throw new Error("Workspace tree projection is incomplete.");
      }

      return projected;
    });

    projectedByNode.set(current.node, {
      canDrag: true,
      childCount: children.length,
      children,
      folderId: current.node.folderId,
      id: `folder:${current.node.folderId}`,
      kind: "folder",
      parentFolderId: current.parentFolderId,
      title: current.node.title,
    });
  }

  return nodes.map((node) => {
    const projected = projectedByNode.get(node);

    if (!projected) {
      throw new Error("Workspace tree projection is incomplete.");
    }

    return projected;
  });
}

export function createUiNoteTree({
  notes,
  tree,
}: {
  notes: Pick<WorkspaceNote, "id" | "title">[];
  tree: NoteTreeNode[];
}): UiTreeNode[] {
  const noteMap = createNoteMap(notes);

  return createUiNoteTreeNodes({
    noteMap,
    nodes: tree,
  });
}
