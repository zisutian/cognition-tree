import { useEffect, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import {
  type FolderId,
  type NoteId,
  type NoteRecord,
  type NoteTreeNode,
} from "../../workspace/model/workspaceData";
import {
  countWorkspaceFolders,
  findWorkspaceFolderIdContainingNote,
  getDefaultWorkspaceFolderId,
} from "../../workspace/queries/workspaceQueries";
import {
  SidebarNoteTree,
  type TreeContextMenuPosition,
} from "./SidebarNoteTree";
import { SidebarScrollArea } from "./SidebarScrollArea";

type SidebarTreeContextMenu =
  | {
      kind: "folder";
      folderId: FolderId;
      title: string;
      position: TreeContextMenuPosition;
    }
  | {
      kind: "note";
      noteId: NoteId;
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

type SidebarNotesPanelProps = {
  activeFolderId: FolderId;
  activeNoteId: NoteId | null;
  notes: NoteRecord[];
  noteTree: NoteTreeNode[];
  onCreateFolder: (parentFolderId: FolderId, title: string) => void;
  onCreateNote: () => void;
  onDeleteFolder: (folderId: FolderId) => void;
  onDeleteNote: (noteId: NoteId) => void;
  onMoveNote: (noteId: NoteId, targetFolderId: FolderId) => void;
  onRenameFolder: (folderId: FolderId, title: string) => void;
  onSelectFolder: (folderId: FolderId) => void;
  onSelectNote: (noteId: NoteId) => void;
};

export function SidebarNotesPanel({
  activeFolderId,
  activeNoteId,
  notes,
  noteTree,
  onCreateFolder,
  onCreateNote,
  onDeleteFolder,
  onDeleteNote,
  onMoveNote,
  onRenameFolder,
  onSelectFolder,
  onSelectNote,
}: SidebarNotesPanelProps) {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<FolderId>>(
    () => new Set(),
  );
  const [contextMenu, setContextMenu] =
    useState<SidebarTreeContextMenu | null>(null);
  const treeSource = { tree: noteTree };
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const folderCount = countWorkspaceFolders(treeSource);
  const activeNoteFolderId = activeNoteId
    ? findWorkspaceFolderIdContainingNote(treeSource, activeNoteId)
    : null;

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

  const toggleFolder = (folderId: FolderId) => {
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
  const expandFolder = (folderId: FolderId) => {
    setCollapsedFolderIds((current) => {
      if (!current.has(folderId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(folderId);
      return next;
    });
  };
  const requestCreateFolder = (parentFolderId: FolderId) => {
    const title = window.prompt("新文件夹名称", "新文件夹");

    if (!title) {
      return;
    }

    onCreateFolder(parentFolderId, title);
    expandFolder(parentFolderId);
  };
  const requestRenameFolder = (folderId: FolderId, currentTitle: string) => {
    const title = window.prompt("文件夹名称", currentTitle);

    if (!title) {
      return;
    }

    onRenameFolder(folderId, title);
  };
  const requestDeleteFolder = (folderId: FolderId, title: string) => {
    if (window.confirm(`删除文件夹「${title}」及其中内容？`)) {
      onDeleteFolder(folderId);
    }
  };

  const openFolderContextMenu = (
    folderId: FolderId,
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
    noteId: NoteId,
    title: string,
    position: TreeContextMenuPosition,
  ) => {
    setContextMenu({
      kind: "note",
      noteId,
      title,
      position: clampContextMenuPosition(position),
    });
  };
  const moveActiveNoteToFolder = (folderId: FolderId) => {
    if (!activeNoteId || activeNoteFolderId === folderId) {
      return;
    }

    onMoveNote(activeNoteId, folderId);
  };
  const moveNoteToSelectedFolder = (noteId: NoteId) => {
    if (
      findWorkspaceFolderIdContainingNote(treeSource, noteId) ===
      activeFolderId
    ) {
      return;
    }

    onMoveNote(noteId, activeFolderId);
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
              onClick={() => requestCreateFolder(activeFolderId)}
              type="button"
            >
              <FolderPlus aria-hidden="true" size={13} strokeWidth={2} />
              文件夹
            </button>
          </div>
        </div>
        <nav className="note-tree" aria-label="笔记仓库">
          <SidebarScrollArea contentClassName="ctn-tree-list note-tree-content">
            <SidebarNoteTree
              activeFolderId={activeFolderId}
              activeNoteId={activeNoteId}
              collapsedFolderIds={collapsedFolderIds}
              nodes={noteTree}
              notesById={notesById}
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
                  disabled={
                    contextMenu.folderId === getDefaultWorkspaceFolderId()
                  }
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
                    !activeNoteId || activeNoteFolderId === contextMenu.folderId
                  }
                  onClick={() => moveActiveNoteToFolder(contextMenu.folderId)}
                  role="menuitem"
                  type="button"
                >
                  移动当前笔记到此处
                </button>
                <button
                  disabled={
                    contextMenu.folderId === getDefaultWorkspaceFolderId() ||
                    folderCount <= 1
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
                  disabled={
                    findWorkspaceFolderIdContainingNote(
                      treeSource,
                      contextMenu.noteId,
                    ) === activeFolderId
                  }
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
