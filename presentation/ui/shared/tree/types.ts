import type { ReactNode } from "react";
import type { ContentTreeContextMenuRequest, TreeDragDrop, TreeSelectionProps } from "compact-ui";
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
  dragDrop?: TreeDragDrop;
  indentUnitCount?: number;
  nodes: StructureTreeNode[];
  stateKey: string;
  onRequestContextMenu?: (request: ContentTreeContextMenuRequest) => void;
};

export type StructureTreeProps = StructureTreeBaseProps & TreeSelectionProps;

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
  | { folderId: string; kind: "folder"; parentFolderId: string | null }
  | { kind: "note"; noteId: string; parentFolderId: string | null };

export type TreeMoveDestination =
  | { kind: "root" }
  | { folderId: string; kind: "inside" }
  | { kind: "after" | "before"; target: TreeNodeReference };

export type TreeMoveRequest = {
  destination: TreeMoveDestination;
  sources: readonly TreeNodeReference[];
};

export type NoteTreeNodeState = {
  hasChildren: boolean;
  isCollapsed: boolean;
  isFolder: boolean;
};

export type NoteTreeProps = {
  contentKey: string;
  selectionMode?: "single" | "multiple";
  selectedIds: ReadonlySet<string>;
  onSelectionChange: (ids: ReadonlySet<string>) => void;
  canMutate?: boolean;
  canDragNode?: (node: TreeNode) => boolean;
  canDropDestination?: (source: TreeNodeReference, destination: TreeMoveDestination) => boolean;
  collapsedFolderIds?: ReadonlySet<string>;
  nodes: TreeNode[];
  renderNodeLeading?: (node: TreeNode, state: NoteTreeNodeState) => ReactNode;
  onDeleteNode?: (node: TreeNode) => void;
  onMoveNodes?: (request: TreeMoveRequest) => void;
  onRenameNode?: (node: TreeNode, title: string) => void;
  onOpenNote?: (noteId: string, intent: "preview" | "pinned") => void;
  onToggleFolder?: (folderId: string) => void;
};
