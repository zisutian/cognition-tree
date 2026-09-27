import type { ReactNode } from "react";
import type { ContentTreeDragDrop } from "compact-ui";
import type { DisplayText } from "../blockText.tsx";

export type StructureTreeNode = {
  children: StructureTreeNode[];
  diagnostics?: readonly {
    severity: "error" | "warning";
    message: string;
  }[];
  id: string;
  label: string;
  lineLabel: string;
  lineNumber: number;
  textDisplay: DisplayText;
};

type StructureTreeBaseProps = {
  ariaLabel: string;
  dragDrop?: ContentTreeDragDrop;
  indentUnitCount?: number;
  nodes: StructureTreeNode[];
  stateKey: string;
  onRequestContextMenu?: (
    nodeId: string,
    position: { x: number; y: number },
  ) => void;
};

export type StructureTreeProps = StructureTreeBaseProps & (
  | {
      selectionMode: "single";
      selectedId: string | null;
      onSelectNode: (node: StructureTreeNode) => void;
    }
  | {
      selectionMode: "collection";
      selectedIds: ReadonlySet<string>;
      selectedRootId: string | null;
      onSelectNode: (node: StructureTreeNode) => void;
    }
  | {
      selectionMode: "none";
    }
);

export type TreeNode =
  | {
      canDrag: boolean;
      childCount?: number;
      children: TreeNode[];
      folderId: string;
      id: string;
      kind: "folder";
      parentFolderId: string | null;
      title: string;
    }
  | {
      canDrag: boolean;
      folderId: string | null;
      id: string;
      kind: "note";
      noteId: string;
      parentFolderId: string | null;
      title: string;
    };

export type TreeNodeReference =
  | {
      folderId: string;
      kind: "folder";
      parentFolderId: string | null;
    }
  | {
      kind: "note";
      noteId: string;
      parentFolderId: string | null;
    };

export type TreeMoveDestination =
  | {
      kind: "root";
    }
  | {
      folderId: string;
      kind: "inside";
    }
  | {
      kind: "after" | "before";
      target: TreeNodeReference;
    };

export type TreeMoveRequest = {
  destination: TreeMoveDestination;
  source: TreeNodeReference;
};

export type NoteTreeActiveNode =
  | {
      folderId: string;
      kind: "folder";
    }
  | {
      kind: "note";
      noteId: string;
    };

export type NoteTreeNodeState = {
  hasChildren: boolean;
  isCollapsed: boolean;
  isFolder: boolean;
};

export type NoteTreeProps = {
  activeNode?: NoteTreeActiveNode | null;
  canDragNode?: (node: TreeNode) => boolean;
  canDropDestination?: (
    source: TreeNodeReference,
    destination: TreeMoveDestination,
  ) => boolean;
  collapsedFolderIds?: ReadonlySet<string>;
  nodes: TreeNode[];
  renderNodeLeading?: (node: TreeNode, state: NoteTreeNodeState) => ReactNode;
  onClearSelection?: () => void;
  onDeleteNode?: (node: TreeNode) => void;
  onMoveNode?: (request: TreeMoveRequest) => void;
  onRenameNode?: (node: TreeNode, title: string) => void;
  onSelectFolder?: (folderId: string) => void;
  onSelectNote?: (noteId: string) => void;
  onOpenNote?: (noteId: string, intent: "preview" | "pinned") => void;
  onToggleFolder?: (folderId: string) => void;
};
