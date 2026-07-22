import { useMemo, useState } from "react";
import {
  ContextMenu,
  type ContextMenuPosition,
} from "../ContextMenu";
import { useFeedback } from "../FeedbackProvider";
import { cx } from "../primitives";
import {
  DirectoryTreeContent,
  VirtualDirectoryTreeContent,
} from "./DirectoryTreeContent";
import type {
  DirectoryTreeEditingNode,
  DirectoryTreeRenderContext,
} from "./directoryTreeRender";
import {
  canDropTreeNode,
  createTreeMoveRequest,
  readTreeNodeDragPayload,
  treeNodeDragDataType,
} from "./drag";
import { flattenVisibleDirectoryTreeRows } from "./directoryRows";
import type {
  NoteTreeProps,
  TreeDragState,
  TreeNode,
} from "./types";
import { shouldVirtualizeTreeRows } from "./virtualTree";

const rootDestination = { kind: "root" } as const;

function isEventOverTreeRow(eventTarget: EventTarget | null) {
  return eventTarget instanceof Element &&
    eventTarget.closest(".ui-tree-row-frame") !== null;
}

export function NoteTree(props: NoteTreeProps) {
  const { runAction } = useFeedback();
  const [contextMenuNode, setContextMenuNode] = useState<TreeNode | null>(null);
  const [contextMenuPosition, setContextMenuPosition] =
    useState<ContextMenuPosition | null>(null);
  const [dragState, setDragState] = useState<TreeDragState | null>(null);
  const [editingNode, setEditingNode] =
    useState<DirectoryTreeEditingNode | null>(null);
  const [pendingDeleteNode, setPendingDeleteNode] = useState<TreeNode | null>(
    null,
  );
  const isRootDropTarget =
    dragState?.activeDestination?.kind === "root" &&
    dragState.activeTargetCanDrop;
  const rows = useMemo(
    () => flattenVisibleDirectoryTreeRows(
      props.nodes,
      props.collapsedFolderIds,
    ),
    [props.collapsedFolderIds, props.nodes],
  );
  const isVirtualized = shouldVirtualizeTreeRows(rows.length);
  const renderContext: DirectoryTreeRenderContext = {
    dragState,
    editingNode,
    pendingDeleteNode,
    props,
    rootNodes: props.nodes,
    runAction,
    setContextMenuNode,
    setContextMenuPosition,
    setDragState,
    setEditingNode,
    setPendingDeleteNode,
  };

  return (
    <div
      className={cx(
        "ui-directory-tree-surface",
        isVirtualized && "is-virtualized",
        isRootDropTarget && "is-root-drop-target",
      )}
      data-tree-root-drop="true"
      onClick={(event) => {
        if (!isEventOverTreeRow(event.target)) {
          props.onClearSelection?.();
          event.currentTarget.focus();
        }
      }}
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
          runAction(() =>
            props.onMoveNode?.(
              createTreeMoveRequest({
                destination: rootDestination,
                source,
              }),
            ),
          );
        }

        setDragState(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          props.onClearSelection?.();
        }
      }}
      tabIndex={props.onClearSelection ? -1 : undefined}
    >
      {isVirtualized ? (
        <VirtualDirectoryTreeContent
          className={props.className}
          context={renderContext}
          rows={rows}
        />
      ) : (
        <DirectoryTreeContent
          className={props.className}
          context={renderContext}
          nodes={props.nodes}
        />
      )}
      <ContextMenu
        ariaLabel="目录操作"
        items={contextMenuNode && props.onRequestMoveNode
          ? [
              {
                id: "move-to",
                label: "移动到…",
                onSelect: () => props.onRequestMoveNode?.(contextMenuNode),
              },
            ]
          : []}
        position={contextMenuPosition}
        onClose={() => {
          setContextMenuNode(null);
          setContextMenuPosition(null);
        }}
      />
    </div>
  );
}
