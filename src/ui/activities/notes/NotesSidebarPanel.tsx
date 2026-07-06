import { useEffect, useMemo, useState, type DragEvent } from "react";
import { FolderPlus, Plus } from "lucide-react";
import type {
  UiFolderId,
  UiNoteId,
  UiTreeNode,
  UiTreeNodeReference,
  UiTreeMovePlacement,
  UiTreeMoveRequest,
} from "../../../application/workspace/projection/viewTree";
import type { UiSidebarView } from "../../../application/workspace/projection/viewSidebar";
import {
  NotesSidebarTree,
  type TreeContextMenuPosition,
} from "./NotesSidebarTree";
import { SidebarScrollArea } from "../../shared/SidebarScrollArea";
import {
  createSidebarTreeDragSession,
  createSidebarTreeDropRequest,
  createSidebarTreeNodeReference,
  getSidebarTreeDropTargetKey,
  getSidebarTreeNodeKey,
  sidebarTreeDragDataType,
} from "./sidebarTreeDrag";

type SidebarTreeContextMenu =
  | {
      kind: "folder";
      folderId: UiFolderId;
      title: string;
      position: TreeContextMenuPosition;
    }
  | {
      folderId: UiFolderId | null;
      kind: "note";
      noteId: UiNoteId;
      title: string;
      position: TreeContextMenuPosition;
    };

const contextMenuWidth = 190;
const contextMenuHeight = 150;

function clampContextMenuPosition(position: TreeContextMenuPosition) {
  return {
    x: Math.max(
      8,
      Math.min(position.x, window.innerWidth - contextMenuWidth - 8),
    ),
    y: Math.max(
      8,
      Math.min(position.y, window.innerHeight - contextMenuHeight - 8),
    ),
  };
}

type NotesSidebarPanelProps = {
  view: UiSidebarView;
  onCreateFolder: (parentFolderId: UiFolderId, title: string) => void;
  onCreateNote: () => void;
  onDeleteFolder: (folderId: UiFolderId) => void;
  onDeleteNote: (noteId: UiNoteId) => void;
  onMoveNote: (noteId: UiNoteId, targetFolderId: UiFolderId) => void;
  onMoveTreeNode: (request: UiTreeMoveRequest) => void;
  onRenameFolder: (folderId: UiFolderId, title: string) => void;
  onSelectFolder: (folderId: UiFolderId) => void;
  onSelectNote: (noteId: UiNoteId) => void;
};

export function NotesSidebarPanel({
  view,
  onCreateFolder,
  onCreateNote,
  onDeleteFolder,
  onDeleteNote,
  onMoveNote,
  onMoveTreeNode,
  onRenameFolder,
  onSelectFolder,
  onSelectNote,
}: NotesSidebarPanelProps) {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<UiFolderId>>(
    () => new Set(),
  );
  const [contextMenu, setContextMenu] =
    useState<SidebarTreeContextMenu | null>(null);
  const [draggingNodeKey, setDraggingNodeKey] = useState<string | null>(null);
  const [activeDropTargetKey, setActiveDropTargetKey] = useState<string | null>(
    null,
  );
  const dragSession = useMemo(createSidebarTreeDragSession, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeContextMenu = () => setContextMenu(null);
    const closeContextMenuWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("keydown", closeContextMenuWithEscape);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("keydown", closeContextMenuWithEscape);
    };
  }, [contextMenu]);

  const toggleFolder = (folderId: UiFolderId) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);

      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  };
  const expandFolder = (folderId: UiFolderId) => {
    setCollapsedFolderIds((current) => {
      if (!current.has(folderId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(folderId);
      return next;
    });
  };
  const requestCreateFolder = (parentFolderId: UiFolderId) => {
    const title = window.prompt("新文件夹名称", "新文件夹");

    if (!title) {
      return;
    }

    onCreateFolder(parentFolderId, title);
    expandFolder(parentFolderId);
  };
  const requestRenameFolder = (folderId: UiFolderId, currentTitle: string) => {
    const title = window.prompt("文件夹名称", currentTitle);

    if (!title) {
      return;
    }

    onRenameFolder(folderId, title);
  };
  const requestDeleteFolder = (folderId: UiFolderId, title: string) => {
    if (window.confirm(`删除文件夹「${title}」及其中内容？`)) {
      onDeleteFolder(folderId);
    }
  };

  const openFolderContextMenu = (
    folderId: UiFolderId,
    title: string,
    position: TreeContextMenuPosition,
  ) => {
    setContextMenu({
      kind: "folder",
      folderId,
      title,
      position: clampContextMenuPosition(position),
    });
  };
  const openNoteContextMenu = (
    noteId: UiNoteId,
    title: string,
    folderId: UiFolderId | null,
    position: TreeContextMenuPosition,
  ) => {
    setContextMenu({
      folderId,
      kind: "note",
      noteId,
      title,
      position: clampContextMenuPosition(position),
    });
  };
  const moveActiveNoteToFolder = (folderId: UiFolderId) => {
    if (!view.activeNoteId || view.activeNoteFolderId === folderId) {
      return;
    }

    onMoveNote(view.activeNoteId, folderId);
  };
  const moveNoteToSelectedFolder = (noteId: UiNoteId) => {
    if (
      contextMenu?.kind === "note" &&
      contextMenu.folderId === view.activeFolderId
    ) {
      return;
    }

    onMoveNote(noteId, view.activeFolderId);
  };
  const readDragPayload = (event: DragEvent<HTMLElement>) =>
    dragSession.read({
      plainText: event.dataTransfer.getData("text/plain"),
      typedPayload: event.dataTransfer.getData(sidebarTreeDragDataType),
    });
  const startTreeNodeDrag = (
    event: DragEvent<HTMLButtonElement>,
    node: UiTreeNode,
    siblingIndex: number,
  ) => {
    if (!node.canDrag) {
      event.preventDefault();
      return;
    }

    const nodeReference = createSidebarTreeNodeReference(node);
    const payload = {
      ...nodeReference,
      siblingIndex,
    };
    const payloadText = dragSession.start(payload);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(sidebarTreeDragDataType, payloadText);
    event.dataTransfer.setData("text/plain", payloadText);
    setContextMenu(null);
    setDraggingNodeKey(getSidebarTreeNodeKey(nodeReference));
  };
  const finishTreeNodeDrag = () => {
    dragSession.finish();
    setDraggingNodeKey(null);
    setActiveDropTargetKey(null);
  };
  const getTreeDropRequest = (
    event: DragEvent<HTMLElement>,
    target: UiTreeNodeReference,
    placement: UiTreeMovePlacement,
    targetSiblingIndex: number,
  ) => {
    const source = readDragPayload(event);

    return source
      ? createSidebarTreeDropRequest({
          placement,
          source,
          target,
          targetSiblingIndex,
        })
      : null;
  };
  const dragOverTreeDropTarget = (
    event: DragEvent<HTMLDivElement>,
    target: UiTreeNodeReference,
    placement: UiTreeMovePlacement,
    targetSiblingIndex: number,
  ) => {
    const request = getTreeDropRequest(
      event,
      target,
      placement,
      targetSiblingIndex,
    );

    if (!request) {
      setActiveDropTargetKey(null);
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setActiveDropTargetKey(
      getSidebarTreeDropTargetKey({
        placement,
        target,
      }),
    );
  };
  const leaveTreeDropTarget = (dropTargetKey: string) => {
    setActiveDropTargetKey((current) =>
      current === dropTargetKey ? null : current,
    );
  };
  const dropOnTreeNode = (
    event: DragEvent<HTMLDivElement>,
    target: UiTreeNodeReference,
    placement: UiTreeMovePlacement,
    targetSiblingIndex: number,
  ) => {
    const request = getTreeDropRequest(
      event,
      target,
      placement,
      targetSiblingIndex,
    );

    if (!request) {
      finishTreeNodeDrag();
      return;
    }

    event.preventDefault();
    onMoveTreeNode(request);
    finishTreeNodeDrag();
  };

  return (
    <div className="side-panel-body">
      <section className="side-section notes-section">
        <div className="side-section-header">
          <p className="side-section-title">笔记</p>
          <div className="side-action-group">
            <button
              className="side-action-button"
              onClick={onCreateNote}
              type="button"
            >
              <Plus aria-hidden="true" size={13} strokeWidth={2} />
              新建
            </button>
            <button
              className="side-action-button"
              onClick={() => requestCreateFolder(view.activeFolderId)}
              type="button"
            >
              <FolderPlus aria-hidden="true" size={13} strokeWidth={2} />
              文件夹
            </button>
          </div>
        </div>
        <nav className="note-tree" aria-label="笔记仓库">
          <SidebarScrollArea contentClassName="ctn-tree-list note-tree-content">
            <NotesSidebarTree
              activeDropTargetKey={activeDropTargetKey}
              activeFolderId={view.activeFolderId}
              activeNoteId={view.activeNoteId}
              collapsedFolderIds={collapsedFolderIds}
              draggingNodeKey={draggingNodeKey}
              nodes={view.noteTree}
              onDragEnd={finishTreeNodeDrag}
              onDragLeaveDropTarget={leaveTreeDropTarget}
              onDragOverDropTarget={dragOverTreeDropTarget}
              onDragStart={startTreeNodeDrag}
              onDropOnTreeNode={dropOnTreeNode}
              onOpenFolderMenu={openFolderContextMenu}
              onOpenNoteMenu={openNoteContextMenu}
              onSelectFolder={onSelectFolder}
              onSelectNote={onSelectNote}
              onToggleFolder={toggleFolder}
            />
          </SidebarScrollArea>
        </nav>
        {contextMenu ? (
          <div
            className="sidebar-context-menu"
            role="menu"
            style={{
              left: contextMenu.position.x,
              top: contextMenu.position.y,
            }}
          >
            {contextMenu.kind === "folder" ? (
              <>
                <button
                  onClick={() => requestCreateFolder(contextMenu.folderId)}
                  role="menuitem"
                  type="button"
                >
                  新建子文件夹
                </button>
                <button
                  disabled={contextMenu.folderId === view.defaultFolderId}
                  onClick={() =>
                    requestRenameFolder(contextMenu.folderId, contextMenu.title)
                  }
                  role="menuitem"
                  type="button"
                >
                  重命名
                </button>
                <button
                  disabled={
                    !view.activeNoteId ||
                    view.activeNoteFolderId === contextMenu.folderId
                  }
                  onClick={() => moveActiveNoteToFolder(contextMenu.folderId)}
                  role="menuitem"
                  type="button"
                >
                  移动当前笔记到此处
                </button>
                <button
                  disabled={
                    contextMenu.folderId === view.defaultFolderId ||
                    view.folderCount <= 1
                  }
                  onClick={() =>
                    requestDeleteFolder(contextMenu.folderId, contextMenu.title)
                  }
                  role="menuitem"
                  type="button"
                >
                  删除文件夹
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={contextMenu.folderId === view.activeFolderId}
                  onClick={() => moveNoteToSelectedFolder(contextMenu.noteId)}
                  role="menuitem"
                  type="button"
                >
                  移动此笔记到所选文件夹
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`删除笔记「${contextMenu.title}」？`)) {
                      onDeleteNote(contextMenu.noteId);
                    }
                  }}
                  role="menuitem"
                  type="button"
                >
                  删除笔记
                </button>
              </>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
