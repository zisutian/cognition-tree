import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
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
  collapsedFolderIds: Set<UiFolderId>;
  draggingNodeKey: string | null;
  nodes: UiTreeNode[];
  selectedTreeNodeKey: string | null;
  onDeleteFolder: (folderId: UiFolderId, title: string) => void;
  onDeleteNote: (noteId: UiNoteId, title: string) => void;
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
  onRenameFolder: (folderId: UiFolderId, title: string) => void;
  onRenameNote: (noteId: UiNoteId, title: string) => void;
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
          ? `note-tree-drop-zone note-tree-drop-zone-${placement} is-drop-target`
          : `note-tree-drop-zone note-tree-drop-zone-${placement}`
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

function SidebarTreeRowActions({
  deleteLabel,
  onDelete,
  onRename,
  renameLabel,
}: {
  deleteLabel: string;
  onDelete: () => void;
  onRename: () => void;
  renameLabel: string;
}) {
  return (
    <span className="note-tree-row-actions">
      <button
        aria-label={renameLabel}
        className="note-tree-row-action"
        onClick={(event) => {
          event.stopPropagation();
          onRename();
        }}
        title={renameLabel}
        type="button"
      >
        <Pencil aria-hidden="true" size={13} strokeWidth={2} />
      </button>
      <button
        aria-label={deleteLabel}
        className="note-tree-row-action"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        title={deleteLabel}
        type="button"
      >
        <Trash2 aria-hidden="true" size={13} strokeWidth={2} />
      </button>
    </span>
  );
}

export function NotesSidebarTree({
  activeDropTargetKey,
  collapsedFolderIds,
  draggingNodeKey,
  nodes,
  selectedTreeNodeKey,
  onDeleteFolder,
  onDeleteNote,
  onDragEnd,
  onDragLeaveDropTarget,
  onDragOverDropTarget,
  onDragStart,
  onDropOnTreeNode,
  onOpenFolderMenu,
  onOpenNoteMenu,
  onRenameFolder,
  onRenameNote,
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
          const isSelectedFolder = selectedTreeNodeKey === nodeKey;
          const openFolderMenu = (event: MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            onSelectFolder(node.folderId);
            onOpenFolderMenu(node.folderId, node.title, {
              x: event.clientX,
              y: event.clientY,
            });
          };
          const activateFolder = () => {
            onSelectFolder(node.folderId);

            if (hasChildren) {
              onToggleFolder(node.folderId);
            }
          };

          return (
            <div className="note-folder" key={node.id}>
              <div className="note-tree-node-frame">
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
                      "ctn-tree-row note-folder-row",
                      isSelectedFolder ? "is-active active" : "",
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
                    aria-expanded={hasChildren ? !isCollapsed : undefined}
                    className="ctn-tree-main ctn-tree-main-label ctn-tree-main-compact note-folder-label"
                    draggable={node.canDrag}
                    onDragEnd={onDragEnd}
                    onDragStart={(event) =>
                      onDragStart(event, node, siblingIndex)
                    }
                    onClick={activateFolder}
                    title={node.title}
                    type="button"
                  >
                    <span className="ctn-tree-toggle note-folder-toggle">
                      {hasChildren ? (
                        isCollapsed ? (
                          <ChevronRight
                            aria-hidden="true"
                            size={15}
                            strokeWidth={2}
                          />
                        ) : (
                          <ChevronDown
                            aria-hidden="true"
                            size={15}
                            strokeWidth={2}
                          />
                        )
                      ) : (
                        <span aria-hidden="true" />
                      )}
                    </span>
                    <span className="ctn-tree-text">{node.title}</span>
                  </button>
                  {isSelectedFolder ? (
                    <SidebarTreeRowActions
                      deleteLabel="删除文件夹"
                      renameLabel="重命名文件夹"
                      onDelete={() =>
                        onDeleteFolder(node.folderId, node.title)
                      }
                      onRename={() =>
                        onRenameFolder(node.folderId, node.title)
                      }
                    />
                  ) : null}
                </div>
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
              {!isCollapsed ? (
                <div className="ctn-tree-children note-folder-children">
                  {hasChildren ? (
                    <NotesSidebarTree
                      activeDropTargetKey={activeDropTargetKey}
                      collapsedFolderIds={collapsedFolderIds}
                      draggingNodeKey={draggingNodeKey}
                      nodes={node.children}
                      selectedTreeNodeKey={selectedTreeNodeKey}
                      onDeleteFolder={onDeleteFolder}
                      onDeleteNote={onDeleteNote}
                      onDragEnd={onDragEnd}
                      onDragLeaveDropTarget={onDragLeaveDropTarget}
                      onDragOverDropTarget={onDragOverDropTarget}
                      onDragStart={onDragStart}
                      onDropOnTreeNode={onDropOnTreeNode}
                      onOpenFolderMenu={onOpenFolderMenu}
                      onOpenNoteMenu={onOpenNoteMenu}
                      onRenameFolder={onRenameFolder}
                      onRenameNote={onRenameNote}
                      onSelectFolder={onSelectFolder}
                      onSelectNote={onSelectNote}
                      onToggleFolder={onToggleFolder}
                    />
                  ) : (
                    <p className="side-muted">空</p>
                  )}
                </div>
              ) : null}
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
        const isSelectedNote = selectedTreeNodeKey === nodeKey;

        return (
          <div
            className="note-tree-node-frame note-item-row"
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
            <div
              className={
                [
                  "ctn-tree-row note-item-row-content",
                  isSelectedNote ? "is-active active" : "",
                  isDragging ? "is-dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            >
              <button
                className="ctn-tree-main ctn-tree-main-note note-item"
                draggable={node.canDrag}
                onDragEnd={onDragEnd}
                onDragStart={(event) => onDragStart(event, node, siblingIndex)}
                onClick={() => onSelectNote(node.noteId)}
                title={node.title}
                type="button"
              >
                <span className="ctn-tree-text">{node.title}</span>
              </button>
              {isSelectedNote ? (
                <SidebarTreeRowActions
                  deleteLabel="删除笔记"
                  renameLabel="重命名笔记"
                  onDelete={() => onDeleteNote(node.noteId, node.title)}
                  onRename={() => onRenameNote(node.noteId, node.title)}
                />
              ) : null}
            </div>
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
