import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import type {
  CSSProperties,
  DragEvent,
  ReactNode,
} from "react";
import { cx } from "../primitives";
import {
  canDropTreeNode,
  createTreeMoveRequest,
  createTreeNodeDragPayload,
  createTreeRowDropDestination,
  getTreeDragClassNames,
  getTreeMoveDestinationTargetKey,
  getTreeNodeReference,
  getTreeNodeReferenceKey,
  readTreeNodeDragPayload,
  treeNodeDragDataType,
} from "./drag";
import {
  isActiveDirectoryTreeNode,
  type DirectoryTreeRenderContext,
} from "./directoryTreeRender";
import type { TreeNode, TreeNodeReference } from "./types";

type DirectoryTreeRowProps = {
  children?: ReactNode;
  context: DirectoryTreeRenderContext;
  itemClassName?: string;
  itemPosition?: number;
  itemSetSize?: number;
  itemStyle?: CSSProperties;
  node: TreeNode;
};

function getRowDropDestination(
  event: DragEvent<HTMLDivElement>,
  target: TreeNodeReference,
) {
  const rect = event.currentTarget.getBoundingClientRect();

  return createTreeRowDropDestination({
    offsetY: event.clientY - rect.top,
    rowHeight: rect.height,
    target,
  });
}

export function DirectoryTreeRow({
  children,
  context,
  itemClassName,
  itemPosition,
  itemSetSize,
  itemStyle,
  node,
}: DirectoryTreeRowProps) {
  const {
    dragState,
    editingNode,
    pendingDeleteNode,
    props,
    rootNodes,
    runAction,
    setContextMenuNode,
    setContextMenuPosition,
    setDragState,
    setEditingNode,
    setPendingDeleteNode,
  } = context;
  const {
    activeNode,
    canDragNode,
    canDropDestination,
    collapsedFolderIds,
    onDeleteNode,
    onMoveNode,
    onRenameNode,
    onRequestMoveNode,
    onSelectFolder,
    onSelectNote,
    onToggleFolder,
    renderNoteBadges,
    renderNodeLeading,
  } = props;
  const nodeReference = getTreeNodeReference(node);
  const nodeKey = getTreeNodeReferenceKey(nodeReference);
  const isFolder = node.kind === "folder";
  const hasChildren = isFolder && node.children.length > 0;
  const isCollapsed =
    isFolder && collapsedFolderIds?.has(node.folderId) === true;
  const isActive = isActiveDirectoryTreeNode(activeNode, node);
  const draggable = node.canDrag && (canDragNode?.(node) ?? true);
  const isEditing = editingNode?.key === nodeKey;
  const pendingDeleteNodeKey = pendingDeleteNode
    ? getTreeNodeReferenceKey(getTreeNodeReference(pendingDeleteNode))
    : null;
  const isDeletePending = pendingDeleteNodeKey === nodeKey;
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
  const commitRename = () => {
    const nextTitle = editingNode?.title.trim() ?? "";

    if (nextTitle && nextTitle !== node.title) {
      runAction(() => onRenameNode?.(node, nextTitle));
    }

    setEditingNode(null);
  };

  return (
    <li
      aria-posinset={itemPosition}
      aria-setsize={itemSetSize}
      className={itemClassName}
      style={itemStyle}
    >
      <div
        className={cx(
          "ui-tree-row-frame",
          isActive && "is-selected",
          isEditing && "is-editing",
          isDeletePending && "is-delete-pending",
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

          setDragState((current) => {
            if (
              !current ||
              getTreeMoveDestinationTargetKey(current.activeDestination) !==
                nodeKey
            ) {
              return current;
            }

            return {
              ...current,
              activeDestination: null,
              activeTargetCanDrop: false,
            };
          });
        }}
        onContextMenu={(event) => {
          if (!onRequestMoveNode) {
            return;
          }

          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();

          setContextMenuNode(node);
          setContextMenuPosition({
            x: event.clientX || rect.left + rect.width / 2,
            y: event.clientY || rect.bottom,
          });
        }}
        onDragOver={(event) => {
          if (!onMoveNode || !dragState) {
            return;
          }

          event.stopPropagation();
          const destination = getRowDropDestination(event, nodeReference);
          const activeTargetCanDrop = canDropTreeNode({
            canDropDestination,
            destination,
            nodes: rootNodes,
            source: dragState.source,
          });

          event.preventDefault();
          event.dataTransfer.dropEffect = activeTargetCanDrop ? "move" : "none";
          setDragState((current) =>
            current
              ? {
                  ...current,
                  activeDestination: destination,
                  activeTargetCanDrop,
                }
              : current,
          );
        }}
        onDrop={(event) => {
          if (!onMoveNode) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          const source = readTreeNodeDragPayload(
            event.dataTransfer.getData(treeNodeDragDataType) ||
              event.dataTransfer.getData("text/plain"),
          );
          const destination = getRowDropDestination(event, nodeReference);

          if (
            source &&
            canDropTreeNode({
              canDropDestination,
              destination,
              nodes: rootNodes,
              source,
            })
          ) {
            runAction(() =>
              onMoveNode?.(createTreeMoveRequest({ destination, source })),
            );
          }

          setDragState(null);
        }}
      >
        {isEditing ? (
          <div className="ui-tree-row ui-directory-tree-row ui-tree-row-editing">
            {leadingContent}
            <input
              autoFocus
              aria-label={`重命名${node.kind === "folder" ? "文件夹" : "笔记"}`}
              className="ui-input ui-input-tree"
              value={editingNode.title}
              onChange={(event) =>
                setEditingNode({ key: nodeKey, title: event.target.value })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                } else if (event.key === "Escape") {
                  setEditingNode(null);
                }
              }}
            />
            {node.kind === "note" ? renderNoteBadges?.(node) : null}
          </div>
        ) : (
          <button
            aria-expanded={isFolder && hasChildren ? !isCollapsed : undefined}
            className="ui-tree-row ui-directory-tree-row"
            draggable={draggable}
            onClick={() => {
              setPendingDeleteNode(null);

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
                activeDestination: null,
                activeTargetCanDrop: false,
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
        )}
        {onRenameNode || onDeleteNode ? (
          <span className="ui-tree-actions">
            {isEditing ? (
              <>
                <button onClick={commitRename} type="button">确定</button>
                <button onClick={() => setEditingNode(null)} type="button">
                  取消
                </button>
              </>
            ) : (
              <>
                {onRenameNode ? (
                  <button
                    onClick={() => {
                      setEditingNode({ key: nodeKey, title: node.title });
                      setPendingDeleteNode(null);
                    }}
                    type="button"
                  >
                    改
                  </button>
                ) : null}
                {onDeleteNode ? (
                  <button
                    onClick={() => {
                      setEditingNode(null);
                      setPendingDeleteNode(node);
                    }}
                    type="button"
                  >
                    删
                  </button>
                ) : null}
              </>
            )}
          </span>
        ) : null}
      </div>
      {children}
    </li>
  );
}
