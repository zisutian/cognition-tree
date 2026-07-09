import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import type {
  CSSProperties,
  Dispatch,
  DragEvent,
  ReactNode,
  SetStateAction,
} from "react";
import { useState } from "react";
import {
  BlockText,
  type DisplayText,
} from "./blockText";
import { cx } from "./primitives";

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

type StructureTreeProps = {
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

type NoteTreeNodeState = {
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

export const treeNodeDragDataType = "application/x-cognition-tree-node";

function getTreeNodeReference(node: TreeNode): TreeNodeReference {
  return node.kind === "folder"
    ? {
        folderId: node.folderId,
        kind: "folder",
        parentFolderId: node.parentFolderId,
      }
    : {
        kind: "note",
        noteId: node.noteId,
        parentFolderId: node.parentFolderId,
    };
}

export function createTreeNodeDragPayload(reference: TreeNodeReference) {
  return JSON.stringify(reference);
}

export function getTreeNodeReferenceKey(reference: TreeNodeReference) {
  return reference.kind === "folder"
    ? `folder:${reference.folderId}`
    : `note:${reference.noteId}`;
}

function isSameTreeNodeReference(
  first: TreeNodeReference,
  second: TreeNodeReference,
) {
  return getTreeNodeReferenceKey(first) === getTreeNodeReferenceKey(second);
}

export function readTreeNodeDragPayload(value: string): TreeNodeReference | null {
  try {
    const parsed = JSON.parse(value) as TreeNodeReference;

    return parsed.kind === "folder" || parsed.kind === "note" ? parsed : null;
  } catch {
    return null;
  }
}

export function canDropTreeNode({
  canDropNode,
  source,
  target,
}: {
  canDropNode?: (source: TreeNodeReference, target: TreeNodeReference) => boolean;
  source: TreeNodeReference;
  target: TreeNodeReference;
}) {
  if (isSameTreeNodeReference(source, target)) {
    return false;
  }

  return canDropNode?.(source, target) ?? true;
}

export function createTreeMoveRequest({
  source,
  target,
}: {
  source: TreeNodeReference;
  target: TreeNodeReference;
}): TreeMoveRequest {
  return {
    placement: target.kind === "folder" ? "inside" : "after",
    source,
    target,
  };
}

export function getTreeDragClassNames({
  dragState,
  nodeReference,
}: {
  dragState: TreeDragState | null;
  nodeReference: TreeNodeReference;
}) {
  if (!dragState) {
    return [];
  }

  const nodeKey = getTreeNodeReferenceKey(nodeReference);

  return [
    dragState.sourceKey === nodeKey && "is-dragging",
    dragState.activeTargetKey === nodeKey &&
      (dragState.activeTargetCanDrop ? "is-drop-target" : "is-drop-disabled"),
  ];
}

function isActiveTreeNode({
  activeFolderId,
  activeNode,
  activeNoteId,
  node,
}: {
  activeFolderId?: string | null;
  activeNode?: NoteTreeActiveNode | null;
  activeNoteId?: string | null;
  node: TreeNode;
}) {
  if (activeNode) {
    if (node.kind === "note" && activeNode.kind === "note") {
      return node.noteId === activeNode.noteId;
    }

    if (node.kind === "folder" && activeNode.kind === "folder") {
      return node.folderId === activeNode.folderId;
    }

    return false;
  }

  return node.kind === "note"
    ? activeNoteId === node.noteId
    : activeFolderId === node.folderId;
}

export const defaultStructureTreeIndentUnitCount = 4;
export const defaultStructureTreeIndentWidthPx = 14;

export function normalizeStructureTreeIndentUnitCount(
  indentUnitCount = defaultStructureTreeIndentUnitCount,
) {
  const normalizedIndentUnitCount = Math.floor(indentUnitCount);

  return Number.isFinite(normalizedIndentUnitCount) &&
    normalizedIndentUnitCount > 0
    ? normalizedIndentUnitCount
    : defaultStructureTreeIndentUnitCount;
}

export function getStructureTreeIndentWidthPx(indentUnitCount?: number) {
  return (
    (normalizeStructureTreeIndentUnitCount(indentUnitCount) /
      defaultStructureTreeIndentUnitCount) *
    defaultStructureTreeIndentWidthPx
  );
}

export function getStructureTreeRowStyle({
  depth,
  indentUnitCount,
}: {
  depth: number;
  indentUnitCount?: number;
}) {
  return {
    "--ui-structure-depth": String(depth),
    "--ui-structure-indent-width": `${getStructureTreeIndentWidthPx(
      indentUnitCount,
    )}px`,
  } as CSSProperties;
}

export function StructureTreeRowContent({
  label,
  lineLabel,
  textDisplay,
}: {
  label: string;
  lineLabel: string;
  textDisplay: DisplayText;
}) {
  return (
    <>
      <span className="ui-structure-prefix">
        <span className="ui-structure-marker">{label}</span>
      </span>
      <BlockText text={textDisplay} />
      <span className="ui-tree-meta">{lineLabel}</span>
    </>
  );
}

function StructureTreeContent({
  activeLineNumber,
  activeLineNumbers,
  className,
  depth,
  dragDataType,
  draggingLineNumber,
  draggable = false,
  getDragPayload,
  indentUnitCount,
  nodes,
  selectedRootLineNumber,
  onDragEnd,
  onDragStart,
  onSelectLine,
}: StructureTreeProps & { depth: number }) {
  return (
    <ul className={cx("ui-tree ui-structure-tree", className)}>
      {nodes.map((node) => {
        const isSelected =
          activeLineNumber === node.lineNumber ||
          activeLineNumbers?.has(node.lineNumber) === true;
        const payload = getDragPayload?.(node.lineNumber) ?? String(node.lineNumber);

        return (
          <li key={node.id}>
            <button
              className={cx(
                "ui-tree-row ui-structure-tree-row",
                isSelected && "is-selected is-selected-subtree",
                selectedRootLineNumber === node.lineNumber && "is-selected-root",
                draggingLineNumber === String(node.lineNumber) && "is-dragging",
                node.hasDiagnostics && "has-diagnostics",
              )}
              draggable={draggable}
              style={getStructureTreeRowStyle({ depth, indentUnitCount })}
              onClick={() => onSelectLine?.(node.lineNumber)}
              onDragEnd={onDragEnd}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", payload);

                if (dragDataType) {
                  event.dataTransfer.setData(dragDataType, payload);
                }

                onDragStart?.(node.lineNumber, event);
              }}
              title={`${node.label}: ${node.textDisplay.displayText}`}
              type="button"
            >
              <StructureTreeRowContent
                label={node.label}
                lineLabel={node.lineLabel}
                textDisplay={node.textDisplay}
              />
            </button>
            {node.children.length > 0 ? (
              <StructureTreeContent
                activeLineNumber={activeLineNumber}
                activeLineNumbers={activeLineNumbers}
                depth={depth + 1}
                dragDataType={dragDataType}
                draggingLineNumber={draggingLineNumber}
                draggable={draggable}
                getDragPayload={getDragPayload}
                indentUnitCount={indentUnitCount}
                nodes={node.children}
                selectedRootLineNumber={selectedRootLineNumber}
                onDragEnd={onDragEnd}
                onDragStart={onDragStart}
                onSelectLine={onSelectLine}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function StructureTree(props: StructureTreeProps) {
  return <StructureTreeContent {...props} depth={0} />;
}

export function OutlineTree({
  indentUnitCount,
  nodes,
  onSelectLine,
}: {
  indentUnitCount?: number;
  nodes: StructureTreeNode[];
  onSelectLine: (lineNumber: number) => void;
}) {
  return (
    <StructureTree
      indentUnitCount={indentUnitCount}
      nodes={nodes}
      onSelectLine={onSelectLine}
    />
  );
}

type NoteTreeProps = {
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
  onToggleFolder?: (folderId: string) => void;
  onMoveNode?: (request: TreeMoveRequest) => void;
  onSelectFolder?: (folderId: string) => void;
  onSelectNote?: (noteId: string) => void;
};

type NoteTreeContentProps = NoteTreeProps & {
  dragState: TreeDragState | null;
  setDragState: Dispatch<SetStateAction<TreeDragState | null>>;
};

function NoteTreeContent({
  activeNoteId,
  actions,
  activeNode,
  activeFolderId,
  canDragNode,
  canDropNode,
  className,
  collapsedFolderIds,
  nodes,
  renderNoteBadges,
  renderNodeLeading,
  onToggleFolder,
  onMoveNode,
  onSelectFolder,
  onSelectNote,
  dragState,
  setDragState,
}: NoteTreeContentProps) {
  return (
    <ul className={cx("ui-tree ui-directory-tree", className)}>
      {nodes.map((node) => {
        const nodeActions = actions?.(node) ?? [];
        const nodeReference = getTreeNodeReference(node);
        const nodeKey = getTreeNodeReferenceKey(nodeReference);
        const isFolder = node.kind === "folder";
        const hasChildren = isFolder && node.children.length > 0;
        const isCollapsed =
          isFolder && collapsedFolderIds?.has(node.folderId) === true;
        const isActive = isActiveTreeNode({
          activeFolderId,
          activeNode,
          activeNoteId,
          node,
        });
        const draggable = node.canDrag && (canDragNode?.(node) ?? true);
        const nodeState = {
          hasChildren,
          isCollapsed,
          isFolder,
        };
        const leadingContent = renderNodeLeading ? (
          renderNodeLeading(node, nodeState)
        ) : node.kind === "folder" ? (
          <>
            {hasChildren && !isCollapsed ? (
              <ChevronDown aria-hidden="true" size={13} />
            ) : (
              <ChevronRight aria-hidden="true" size={13} />
            )}
            <Folder aria-hidden="true" size={13} />
          </>
        ) : (
          <>
            <span aria-hidden="true" className="ui-tree-toggle-spacer" />
            <FileText aria-hidden="true" size={13} />
          </>
        );

        return (
          <li key={node.id}>
            <div
              className={cx(
                "ui-tree-row-frame",
                isActive && "is-selected",
                ...getTreeDragClassNames({ dragState, nodeReference }),
              )}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;

                if (
                  nextTarget instanceof Node &&
                  event.currentTarget.contains(nextTarget)
                ) {
                  return;
                }

                setDragState((current) =>
                  current?.activeTargetKey === nodeKey
                    ? {
                        ...current,
                        activeTargetCanDrop: false,
                        activeTargetKey: null,
                      }
                    : current,
                );
              }}
              onDragOver={(event) => {
                if (!onMoveNode || !dragState) {
                  return;
                }

                const activeTargetCanDrop = canDropTreeNode({
                  canDropNode,
                  source: dragState.source,
                  target: nodeReference,
                });

                event.preventDefault();
                event.dataTransfer.dropEffect = activeTargetCanDrop
                  ? "move"
                  : "none";
                setDragState((current) =>
                  current
                    ? {
                        ...current,
                        activeTargetCanDrop,
                        activeTargetKey: nodeKey,
                      }
                    : current,
                );
              }}
              onDrop={(event) => {
                if (!onMoveNode) {
                  return;
                }

                event.preventDefault();
                const source = readTreeNodeDragPayload(
                  event.dataTransfer.getData(treeNodeDragDataType) ||
                    event.dataTransfer.getData("text/plain"),
                );

                if (
                  source &&
                  canDropTreeNode({ canDropNode, source, target: nodeReference })
                ) {
                  onMoveNode?.(
                    createTreeMoveRequest({
                      source,
                      target: nodeReference,
                    }),
                  );
                }

                setDragState(null);
              }}
            >
              <button
                className="ui-tree-row ui-directory-tree-row"
                draggable={draggable}
                aria-expanded={
                  isFolder && hasChildren ? !isCollapsed : undefined
                }
                onClick={() => {
                  if (node.kind === "note") {
                    onSelectNote?.(node.noteId);
                    return;
                  }

                  onSelectFolder?.(node.folderId);

                  if (hasChildren) {
                    onToggleFolder?.(node.folderId);
                  }
                }}
                onDragStart={(event) => {
                  if (!draggable) {
                    event.preventDefault();
                    return;
                  }

                  const payload = createTreeNodeDragPayload(nodeReference);

                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(treeNodeDragDataType, payload);
                  event.dataTransfer.setData("text/plain", payload);
                  setDragState({
                    activeTargetCanDrop: false,
                    activeTargetKey: null,
                    source: nodeReference,
                    sourceKey: nodeKey,
                  });
                }}
                onDragEnd={() => setDragState(null)}
                title={node.title}
                type="button"
              >
                {leadingContent}
                <span className="ui-tree-text">{node.title}</span>
                {node.kind === "note" ? renderNoteBadges?.(node) : null}
              </button>
              {nodeActions.length > 0 ? (
                <span className="ui-tree-actions">
                  {nodeActions.map((action) => (
                    <button
                      disabled={action.disabled}
                      key={action.label}
                      onClick={(event) => {
                        event.stopPropagation();
                        action.onClick();
                      }}
                      onMouseDown={(event) => event.stopPropagation()}
                      title={action.title}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
            {node.kind === "folder" && node.children.length > 0 && !isCollapsed ? (
              <NoteTreeContent
                activeFolderId={activeFolderId}
                activeNode={activeNode}
                activeNoteId={activeNoteId}
                actions={actions}
                canDragNode={canDragNode}
                canDropNode={canDropNode}
                collapsedFolderIds={collapsedFolderIds}
                dragState={dragState}
                nodes={node.children}
                renderNoteBadges={renderNoteBadges}
                renderNodeLeading={renderNodeLeading}
                setDragState={setDragState}
                onToggleFolder={onToggleFolder}
                onMoveNode={onMoveNode}
                onSelectFolder={onSelectFolder}
                onSelectNote={onSelectNote}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function NoteTree(props: NoteTreeProps) {
  const [dragState, setDragState] = useState<TreeDragState | null>(null);

  return (
    <NoteTreeContent
      {...props}
      dragState={dragState}
      setDragState={setDragState}
    />
  );
}
