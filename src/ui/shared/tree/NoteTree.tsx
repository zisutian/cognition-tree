import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import type {
  DragEvent,
  Dispatch,
  SetStateAction,
} from "react";
import { useState } from "react";
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
import type {
  NoteTreeActiveNode,
  NoteTreeProps,
  TreeDragState,
  TreeNode,
  TreeNodeReference,
} from "./types";

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

function isActiveTreeNode({
  activeNode,
  node,
}: {
  activeNode?: NoteTreeActiveNode | null;
  node: TreeNode;
}) {
  if (node.kind === "note" && activeNode?.kind === "note") {
    return node.noteId === activeNode.noteId;
  }

  return node.kind === "folder" && activeNode?.kind === "folder"
    ? node.folderId === activeNode.folderId
    : false;
}

type NoteTreeContentProps = NoteTreeProps & {
  dragState: TreeDragState | null;
  editingNode: { key: string; title: string } | null;
  pendingDeleteNodeKey: string | null;
  rootNodes: TreeNode[];
  setDragState: Dispatch<SetStateAction<TreeDragState | null>>;
  setEditingNode: Dispatch<
    SetStateAction<{ key: string; title: string } | null>
  >;
  setPendingDeleteNodeKey: Dispatch<SetStateAction<string | null>>;
};

function NoteTreeContent({
  activeNode,
  canDragNode,
  canDropDestination,
  className,
  collapsedFolderIds,
  nodes,
  renderNoteBadges,
  renderNodeLeading,
  onDeleteNode,
  onMoveNode,
  onRenameNode,
  onSelectFolder,
  onSelectNote,
  onToggleFolder,
  dragState,
  editingNode,
  pendingDeleteNodeKey,
  rootNodes,
  setDragState,
  setEditingNode,
  setPendingDeleteNodeKey,
}: NoteTreeContentProps) {
  return (
    <ul className={cx("ui-tree ui-directory-tree", className)}>
      {nodes.map((node) => {
        const nodeReference = getTreeNodeReference(node);
        const nodeKey = getTreeNodeReferenceKey(nodeReference);
        const isFolder = node.kind === "folder";
        const hasChildren = isFolder && node.children.length > 0;
        const isCollapsed =
          isFolder && collapsedFolderIds?.has(node.folderId) === true;
        const isActive = isActiveTreeNode({
          activeNode,
          node,
        });
        const draggable = node.canDrag && (canDragNode?.(node) ?? true);
        const isEditing = editingNode?.key === nodeKey;
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
            onRenameNode?.(node, nextTitle);
          }

          setEditingNode(null);
        };

        return (
          <li key={node.id}>
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
                    getTreeMoveDestinationTargetKey(
                      current.activeDestination,
                    ) !== nodeKey
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
              onDragOver={(event) => {
                if (!onMoveNode || !dragState) {
                  return;
                }

                event.stopPropagation();
                const destination = getRowDropDestination(
                  event,
                  nodeReference,
                );
                const activeTargetCanDrop = canDropTreeNode({
                  canDropDestination,
                  destination,
                  nodes: rootNodes,
                  source: dragState.source,
                });

                event.preventDefault();
                event.dataTransfer.dropEffect = activeTargetCanDrop
                  ? "move"
                  : "none";
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
                const destination = getRowDropDestination(
                  event,
                  nodeReference,
                );

                if (
                  source &&
                  canDropTreeNode({
                    canDropDestination,
                    destination,
                    nodes: rootNodes,
                    source,
                  })
                ) {
                  onMoveNode?.(
                    createTreeMoveRequest({
                      destination,
                      source,
                    }),
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
                  aria-expanded={
                    isFolder && hasChildren ? !isCollapsed : undefined
                  }
                  className="ui-tree-row ui-directory-tree-row"
                  draggable={draggable}
                  onClick={() => {
                    setPendingDeleteNodeKey(null);

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
                      <button onClick={() => setEditingNode(null)} type="button">取消</button>
                    </>
                  ) : isDeletePending ? (
                    <>
                      <button
                        onClick={() => {
                          onDeleteNode?.(node);
                          setPendingDeleteNodeKey(null);
                        }}
                        type="button"
                      >
                        确认
                      </button>
                      <button
                        onClick={() => setPendingDeleteNodeKey(null)}
                        type="button"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      {onRenameNode ? (
                        <button
                          onClick={() => {
                            setEditingNode({ key: nodeKey, title: node.title });
                            setPendingDeleteNodeKey(null);
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
                            setPendingDeleteNodeKey(nodeKey);
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
            {node.kind === "folder" && node.children.length > 0 && !isCollapsed ? (
              <NoteTreeContent
                activeNode={activeNode}
                canDragNode={canDragNode}
                canDropDestination={canDropDestination}
                collapsedFolderIds={collapsedFolderIds}
                dragState={dragState}
                editingNode={editingNode}
                nodes={node.children}
                pendingDeleteNodeKey={pendingDeleteNodeKey}
                rootNodes={rootNodes}
                renderNoteBadges={renderNoteBadges}
                renderNodeLeading={renderNodeLeading}
                setDragState={setDragState}
                setEditingNode={setEditingNode}
                setPendingDeleteNodeKey={setPendingDeleteNodeKey}
                onDeleteNode={onDeleteNode}
                onMoveNode={onMoveNode}
                onRenameNode={onRenameNode}
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
  const [editingNode, setEditingNode] = useState<{
    key: string;
    title: string;
  } | null>(null);
  const [pendingDeleteNodeKey, setPendingDeleteNodeKey] = useState<string | null>(
    null,
  );
  const rootDestination = { kind: "root" } as const;
  const isRootDropTarget =
    dragState?.activeDestination?.kind === "root" &&
    dragState.activeTargetCanDrop;

  const isEventOverTreeRow = (eventTarget: EventTarget | null) =>
    eventTarget instanceof Element &&
    eventTarget.closest(".ui-tree-row-frame") !== null;

  return (
    <div
      className={cx(
        "ui-directory-tree-surface",
        isRootDropTarget && "is-root-drop-target",
      )}
      data-tree-root-drop="true"
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;

        if (
          nextTarget instanceof Node &&
          event.currentTarget.contains(nextTarget)
        ) {
          return;
        }

        setDragState((current) =>
          current?.activeDestination?.kind === "root"
            ? {
                ...current,
                activeDestination: null,
                activeTargetCanDrop: false,
              }
            : current,
        );
      }}
      onDragOver={(event) => {
        if (
          !props.onMoveNode ||
          !dragState ||
          isEventOverTreeRow(event.target)
        ) {
          return;
        }

        const activeTargetCanDrop = canDropTreeNode({
          canDropDestination: props.canDropDestination,
          destination: rootDestination,
          nodes: props.nodes,
          source: dragState.source,
        });

        event.preventDefault();
        event.dataTransfer.dropEffect = activeTargetCanDrop ? "move" : "none";
        setDragState((current) =>
          current
            ? {
                ...current,
                activeDestination: rootDestination,
                activeTargetCanDrop,
              }
            : current,
        );
      }}
      onDrop={(event) => {
        if (!props.onMoveNode || isEventOverTreeRow(event.target)) {
          return;
        }

        event.preventDefault();
        const source = readTreeNodeDragPayload(
          event.dataTransfer.getData(treeNodeDragDataType) ||
            event.dataTransfer.getData("text/plain"),
        );

        if (
          source &&
          canDropTreeNode({
            canDropDestination: props.canDropDestination,
            destination: rootDestination,
            nodes: props.nodes,
            source,
          })
        ) {
          props.onMoveNode(
            createTreeMoveRequest({
              destination: rootDestination,
              source,
            }),
          );
        }

        setDragState(null);
      }}
    >
      <NoteTreeContent
        {...props}
        dragState={dragState}
        editingNode={editingNode}
        pendingDeleteNodeKey={pendingDeleteNodeKey}
        rootNodes={props.nodes}
        setDragState={setDragState}
        setEditingNode={setEditingNode}
        setPendingDeleteNodeKey={setPendingDeleteNodeKey}
      />
    </div>
  );
}
