import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import type {
  UiFolderId,
  UiNoteId,
  UiTreeNode,
} from "../../../application/workspace/projection/viewTree";

export type TreeContextMenuPosition = {
  x: number;
  y: number;
};

type NotesSidebarTreeProps = {
  activeFolderId: UiFolderId;
  activeNoteId: UiNoteId | null;
  collapsedFolderIds: Set<UiFolderId>;
  nodes: UiTreeNode[];
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

export function NotesSidebarTree({
  activeFolderId,
  activeNoteId,
  collapsedFolderIds,
  nodes,
  onOpenFolderMenu,
  onOpenNoteMenu,
  onSelectFolder,
  onSelectNote,
  onToggleFolder,
}: NotesSidebarTreeProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "folder") {
          const isCollapsed = collapsedFolderIds.has(node.folderId);
          const hasChildren = node.children.length > 0;
          const openFolderMenu = (
            event: React.MouseEvent<HTMLDivElement>,
          ) => {
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
              <div
                className={
                  node.folderId === activeFolderId
                    ? "ctn-tree-row ctn-tree-row-with-toggle is-active note-folder-row active"
                    : "ctn-tree-row ctn-tree-row-with-toggle note-folder-row"
                }
                onContextMenu={openFolderMenu}
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
                      collapsedFolderIds={collapsedFolderIds}
                      nodes={node.children}
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
            </div>
          );
        }

        const openNoteMenu = (event: React.MouseEvent<HTMLDivElement>) => {
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
          >
            <button
              className={
                node.noteId === activeNoteId
                  ? "ctn-tree-main ctn-tree-main-note is-active note-item active"
                  : "ctn-tree-main ctn-tree-main-note note-item"
              }
              onClick={() => onSelectNote(node.noteId)}
              title={node.title}
              type="button"
            >
              <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
              <span className="ctn-tree-text">{node.title}</span>
            </button>
          </div>
        );
      })}
    </>
  );
}
