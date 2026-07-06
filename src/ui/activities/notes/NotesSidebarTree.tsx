import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import type { DragEvent, MouseEvent } from "react";
import type {
  UiFolderId,
  UiNoteId,
  UiTreeNode,
  UiTreeNodeReference,
  UiTreeMovePlacement,
} from "../../../application/workspace/projection/viewTree";
import {
  createSidebarTreeNodeReference,
  getSidebarTreePointerPlacement,
  getSidebarTreeDropTargetKey,
  getSidebarTreeNodeKey,
} from "./sidebarTreeDrag";

export type TreeContextMenuPosition = {
  x: number;
  y: number;
};

type NotesSidebarTreeProps = {
  activeDropTargetKey: string | null;
  activeFolderId: UiFolderId;
  activeNoteId: UiNoteId | null;
  collapsedFolderIds: Set<UiFolderId>;
  draggingNodeKey: string | null;
  nodes: UiTreeNode[];
  onDragEnd: () => void;
  onDragLeaveDropTarget: (dropTargetKey: string) => void;
  onDragOverDropTarget: (
    event: DragEvent<HTMLDivElement>,
    target: UiTreeNodeReference,
    placement: UiTreeMovePlacement,
    targetSiblingIndex: number,
  ) => void;
  onDragStart: (
    event: DragEvent<HTMLButtonElement>,
    node: UiTreeNode,
    siblingIndex: number,
  ) => void;
  onDropOnTreeNode: (
    event: DragEvent<HTMLDivElement>,
    target: UiTreeNodeReference,
    placement: UiTreeMovePlacement,
    targetSiblingIndex: number,
  ) => void;
  onOpenFolderMenu: (
    folderId: UiFolderId,
    title: string,
    position: TreeContextMenuPosition,
  ) => void;
  onOpenNoteMenu: (
    noteId: UiNoteId,
    title: string,
    folderId: UiFolderId | null,
    position: TreeContextMenuPosition,
  ) => void;
  onSelectFolder: (folderId: UiFolderId) => void;
  onSelectNote: (noteId: UiNoteId) => void;
  onToggleFolder: (folderId: UiFolderId) => void;
};

function SidebarTreeDropZone({
  activeDropTargetKey,
  onDragLeaveDropTarget,
  onDragOverDropTarget,
  onDropOnTreeNode,
  placement,
  target,
  targetSiblingIndex,
}: {
  activeDropTargetKey: string | null;
  onDragLeaveDropTarget: (dropTargetKey: string) => void;
  onDragOverDropTarget: (
    event: DragEvent<HTMLDivElement>,
    target: UiTreeNodeReference,
    placement: UiTreeMovePlacement,
    targetSiblingIndex: number,
  ) => void;
  onDropOnTreeNode: (
    event: DragEvent<HTMLDivElement>,
    target: UiTreeNodeReference,
    placement: UiTreeMovePlacement,
    targetSiblingIndex: number,
  ) => void;
  placement: UiTreeMovePlacement;
  target: UiTreeNodeReference;
  targetSiblingIndex: number;
}) {
  const dropTargetKey = getSidebarTreeDropTargetKey({ placement, target });

  return (
    <div
      aria-hidden="true"
      className={
        activeDropTargetKey === dropTargetKey
          ? "note-tree-drop-zone is-drop-target"
          : "note-tree-drop-zone"
      }
      onDragLeave={() => onDragLeaveDropTarget(dropTargetKey)}
      onDragOver={(event) =>
        onDragOverDropTarget(event, target, placement, targetSiblingIndex)
      }
      onDrop={(event) =>
        onDropOnTreeNode(event, target, placement, targetSiblingIndex)
      }
    />
  );
}

export function NotesSidebarTree({
  activeDropTargetKey,
  activeFolderId,
  activeNoteId,
  collapsedFolderIds,
  draggingNodeKey,
  nodes,
  onDragEnd,
  onDragLeaveDropTarget,
  onDragOverDropTarget,
  onDragStart,
  onDropOnTreeNode,
  onOpenFolderMenu,
  onOpenNoteMenu,
  onSelectFolder,
  onSelectNote,
  onToggleFolder,
}: NotesSidebarTreeProps) {
  return (
    <>
      {nodes.map((node, siblingIndex) => {
        const nodeReference = createSidebarTreeNodeReference(node);
        const nodeKey = getSidebarTreeNodeKey(nodeReference);
        const isDragging = draggingNodeKey === nodeKey;
        const dragOverNodeRow = (event: DragEvent<HTMLDivElement>) => {
          onDragOverDropTarget(
            event,
            nodeReference,
            getSidebarTreePointerPlacement({
              pointerY: event.clientY,
              targetKind: node.kind,
              targetRect: event.currentTarget.getBoundingClientRect(),
            }),
            siblingIndex,
          );
        };
        const dropOnNodeRow = (event: DragEvent<HTMLDivElement>) => {
          onDropOnTreeNode(
            event,
            nodeReference,
            getSidebarTreePointerPlacement({
              pointerY: event.clientY,
              targetKind: node.kind,
              targetRect: event.currentTarget.getBoundingClientRect(),
            }),
            siblingIndex,
          );
        };

        if (node.kind === "folder") {
          const isCollapsed = collapsedFolderIds.has(node.folderId);
          const hasChildren = node.children.length > 0;
          const openFolderMenu = (event: MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            onSelectFolder(node.folderId);
            onOpenFolderMenu(node.folderId, node.title, {
              x: event.clientX,
              y: event.clientY,
            });
          };

          return (
            <div className="note-folder" key={node.id}>
              <SidebarTreeDropZone
                activeDropTargetKey={activeDropTargetKey}
                placement="before"
                target={nodeReference}
                targetSiblingIndex={siblingIndex}
                onDragLeaveDropTarget={onDragLeaveDropTarget}
                onDragOverDropTarget={onDragOverDropTarget}
                onDropOnTreeNode={onDropOnTreeNode}
              />
              <div
                className={
                  [
                    "ctn-tree-row ctn-tree-row-with-toggle note-folder-row",
                    node.folderId === activeFolderId ? "is-active active" : "",
                    isDragging ? "is-dragging" : "",
                    activeDropTargetKey ===
                      getSidebarTreeDropTargetKey({
                        placement: "inside",
                        target: nodeReference,
                      })
                      ? "is-drop-inside"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                onContextMenu={openFolderMenu}
                onDragOver={dragOverNodeRow}
                onDrop={dropOnNodeRow}
              >
                <button
                  aria-label={
                    isCollapsed ? `展开 ${node.title}` : `折叠 ${node.title}`
                  }
                  className="ctn-tree-toggle note-folder-toggle"
                  disabled={!hasChildren}
                  onClick={() => onToggleFolder(node.folderId)}
                  title={isCollapsed ? "展开文件夹" : "折叠文件夹"}
                  type="button"
                >
                  {hasChildren ? (
                    isCollapsed ? (
                      <ChevronRight
                        aria-hidden="true"
                        size={13}
                        strokeWidth={2}
                      />
                    ) : (
                      <ChevronDown
                        aria-hidden="true"
                        size={13}
                        strokeWidth={2}
                      />
                    )
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </button>
                <button
                  className="ctn-tree-main ctn-tree-main-with-meta ctn-tree-main-compact note-folder-label"
                  draggable={node.canDrag}
                  onDragEnd={onDragEnd}
                  onDragStart={(event) =>
                    onDragStart(event, node, siblingIndex)
                  }
                  onClick={() => onSelectFolder(node.folderId)}
                  title={node.title}
                  type="button"
                >
                  <Folder aria-hidden="true" size={14} strokeWidth={1.9} />
                  <span className="ctn-tree-text">{node.title}</span>
                  <small className="ctn-tree-meta">{node.childCount}</small>
                </button>
              </div>
              {!isCollapsed ? (
                <div className="ctn-tree-children note-folder-children">
                  {hasChildren ? (
                    <NotesSidebarTree
                      activeFolderId={activeFolderId}
                      activeNoteId={activeNoteId}
                      activeDropTargetKey={activeDropTargetKey}
                      collapsedFolderIds={collapsedFolderIds}
                      draggingNodeKey={draggingNodeKey}
                      nodes={node.children}
                      onDragEnd={onDragEnd}
                      onDragLeaveDropTarget={onDragLeaveDropTarget}
                      onDragOverDropTarget={onDragOverDropTarget}
                      onDragStart={onDragStart}
                      onDropOnTreeNode={onDropOnTreeNode}
                      onOpenFolderMenu={onOpenFolderMenu}
                      onOpenNoteMenu={onOpenNoteMenu}
                      onSelectFolder={onSelectFolder}
                      onSelectNote={onSelectNote}
                      onToggleFolder={onToggleFolder}
                    />
                  ) : (
                    <p className="side-muted">空</p>
                  )}
                </div>
              ) : null}
              <SidebarTreeDropZone
                activeDropTargetKey={activeDropTargetKey}
                placement="after"
                target={nodeReference}
                targetSiblingIndex={siblingIndex}
                onDragLeaveDropTarget={onDragLeaveDropTarget}
                onDragOverDropTarget={onDragOverDropTarget}
                onDropOnTreeNode={onDropOnTreeNode}
              />
            </div>
          );
        }

        const openNoteMenu = (event: MouseEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenNoteMenu(node.noteId, node.title, node.folderId, {
            x: event.clientX,
            y: event.clientY,
          });
        };

        return (
          <div
            className="note-item-row"
            key={node.id}
            onContextMenu={openNoteMenu}
            onDragOver={dragOverNodeRow}
            onDrop={dropOnNodeRow}
          >
            <SidebarTreeDropZone
              activeDropTargetKey={activeDropTargetKey}
              placement="before"
              target={nodeReference}
              targetSiblingIndex={siblingIndex}
              onDragLeaveDropTarget={onDragLeaveDropTarget}
              onDragOverDropTarget={onDragOverDropTarget}
              onDropOnTreeNode={onDropOnTreeNode}
            />
            <button
              className={
                [
                  "ctn-tree-main ctn-tree-main-note note-item",
                  node.noteId === activeNoteId ? "is-active active" : "",
                  isDragging ? "is-dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              draggable={node.canDrag}
              onDragEnd={onDragEnd}
              onDragStart={(event) => onDragStart(event, node, siblingIndex)}
              onClick={() => onSelectNote(node.noteId)}
              title={node.title}
              type="button"
            >
              <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
              <span className="ctn-tree-text">{node.title}</span>
            </button>
            <SidebarTreeDropZone
              activeDropTargetKey={activeDropTargetKey}
              placement="after"
              target={nodeReference}
              targetSiblingIndex={siblingIndex}
              onDragLeaveDropTarget={onDragLeaveDropTarget}
              onDragOverDropTarget={onDragOverDropTarget}
              onDropOnTreeNode={onDropOnTreeNode}
            />
          </div>
        );
      })}
    </>
  );
}
