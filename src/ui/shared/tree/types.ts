import type {
  DragEvent,
  ReactNode,
} from "react";
import type { DisplayText } from "../blockText";

export type TreeDropPlacement = "after" | "before" | "inside";

export type StructureTreeNode = {
  children: StructureTreeNode[];
  hasDiagnostics: boolean;
  id: string;
  label: string;
  lineLabel: string;
  lineNumber: number;
  textDisplay: DisplayText;
};

export type StructureTreeProps = {
  activeLineNumber?: number | null;
  activeLineNumbers?: ReadonlySet<number>;
  className?: string;
  dragDataType?: string;
  draggingLineNumber?: string | null;
  draggable?: boolean;
  getDragPayload?: (lineNumber: number) => string;
  indentUnitCount?: number;
  nodes: StructureTreeNode[];
  selectedRootLineNumber?: number | null;
  onDragEnd?: () => void;
  onDragStart?: (
    lineNumber: number,
    event: DragEvent<HTMLButtonElement>,
  ) => void;
  onSelectLine?: (lineNumber: number) => void;
};

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

export type TreeMoveRequest = {
  placement: TreeDropPlacement;
  source: TreeNodeReference;
  target: TreeNodeReference;
};

export type NoteTreeAction = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  title?: string;
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

export type TreeDragState = {
  activeTargetCanDrop: boolean;
  activeTargetKey: string | null;
  source: TreeNodeReference;
  sourceKey: string;
};

export type NoteTreeProps = {
  activeFolderId?: string | null;
  activeNoteId?: string | null;
  activeNode?: NoteTreeActiveNode | null;
  actions?: (node: TreeNode) => NoteTreeAction[];
  canDragNode?: (node: TreeNode) => boolean;
  canDropNode?: (source: TreeNodeReference, target: TreeNodeReference) => boolean;
  className?: string;
  collapsedFolderIds?: ReadonlySet<string>;
  nodes: TreeNode[];
  renderNoteBadges?: (node: Extract<TreeNode, { kind: "note" }>) => ReactNode;
  renderNodeLeading?: (node: TreeNode, state: NoteTreeNodeState) => ReactNode;
  onMoveNode?: (request: TreeMoveRequest) => void;
  onSelectFolder?: (folderId: string) => void;
  onSelectNote?: (noteId: string) => void;
  onToggleFolder?: (folderId: string) => void;
};
