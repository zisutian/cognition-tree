import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import type {
  Dispatch,
  SetStateAction,
} from "react";
import { useState } from "react";
import { cx } from "../primitives";
import {
  canDropTreeNode,
  createTreeMoveRequest,
  createTreeNodeDragPayload,
  getTreeDragClassNames,
  getTreeNodeReference,
  getTreeNodeReferenceKey,
  readTreeNodeDragPayload,
  treeNodeDragDataType,
} from "./drag";
import type {
  NoteTreeActiveNode,
  NoteTreeProps,
  TreeDragState,
  TreeNode,
} from "./types";

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
  onMoveNode,
  onSelectFolder,
  onSelectNote,
  onToggleFolder,
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
            {hasChildren ? (
              !isCollapsed ? (
                <ChevronDown aria-hidden="true" size={13} />
              ) : (
                <ChevronRight aria-hidden="true" size={13} />
              )
            ) : (
              <span aria-hidden="true" className="ui-tree-toggle-spacer" />
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
                aria-expanded={
                  isFolder && hasChildren ? !isCollapsed : undefined
                }
                className="ui-tree-row ui-directory-tree-row"
                draggable={draggable}
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
                onDragEnd={() => setDragState(null)}
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
                onMoveNode={onMoveNode}
                onSelectFolder={onSelectFolder}
                onSelectNote={onSelectNote}
                onToggleFolder={onToggleFolder}
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
