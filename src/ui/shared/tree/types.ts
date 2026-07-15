import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import type { DisplayText } from "../blockText";

export type StructureTreeNode = {
  children: StructureTreeNode[];
  hasDiagnostics: boolean;
  id: string;
  label: string;
  lineLabel: string;
  lineNumber: number;
  textDisplay: DisplayText;
};

export type StructureTreeRowState = {
  depth: number;
  isSelected: boolean;
  isSelectedRoot: boolean;
};

export type StructureTreeRowProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className" | "onClick" | "style" | "title" | "type"
> & {
  className?: string;
  [dataAttribute: `data-${string}`]: string | boolean | undefined;
};

export type StructureTreeProps = {
  className?: string;
  getRowProps?: (
    node: StructureTreeNode,
    state: StructureTreeRowState,
  ) => StructureTreeRowProps;
  indentUnitCount?: number;
  nodes: StructureTreeNode[];
  selectedLineNumbers?: ReadonlySet<number>;
  selectedRootLineNumber?: number | null;
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

export type TreeDragState = {
  activeDestination: TreeMoveDestination | null;
  activeTargetCanDrop: boolean;
  source: TreeNodeReference;
  sourceKey: string;
};

export type NoteTreeProps = {
  activeNode?: NoteTreeActiveNode | null;
  canDragNode?: (node: TreeNode) => boolean;
  canDropDestination?: (
    source: TreeNodeReference,
    destination: TreeMoveDestination,
  ) => boolean;
  className?: string;
  collapsedFolderIds?: ReadonlySet<string>;
  nodes: TreeNode[];
  renderNoteBadges?: (node: Extract<TreeNode, { kind: "note" }>) => ReactNode;
  renderNodeLeading?: (node: TreeNode, state: NoteTreeNodeState) => ReactNode;
  onClearSelection?: () => void;
  onDeleteNode?: (node: TreeNode) => void;
  onMoveNode?: (request: TreeMoveRequest) => void;
  onRenameNode?: (node: TreeNode, title: string) => void;
  onRequestMoveNode?: (node: TreeNode) => void;
  onSelectFolder?: (folderId: string) => void;
  onSelectNote?: (noteId: string) => void;
  onToggleFolder?: (folderId: string) => void;
};
