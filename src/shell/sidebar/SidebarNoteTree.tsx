import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import {
  defaultFolderId,
  type FolderId,
  type NoteId,
  type NoteRecord,
  type NoteTreeNode,
} from "../../domain/notes";
import { orderNoteTreeNodesFoldersFirst } from "../../domain/noteTree";

export type TreeContextMenuPosition = {
  x: number;
  y: number;
};

type SidebarNoteTreeProps = {
  activeFolderId: FolderId;
  activeNoteId: NoteId | null;
  collapsedFolderIds: Set<FolderId>;
  nodes: NoteTreeNode[];
  notesById: Map<NoteId, NoteRecord>;
  onOpenFolderMenu: (
    folderId: FolderId,
    title: string,
    position: TreeContextMenuPosition,
  ) => void;
  onOpenNoteMenu: (
    noteId: NoteId,
    title: string,
    position: TreeContextMenuPosition,
  ) => void;
  onSelectFolder: (folderId: FolderId) => void;
  onSelectNote: (noteId: NoteId) => void;
  onToggleFolder: (folderId: FolderId) => void;
};

function getFolderDisplayTitle(folderId: FolderId, title: string) {
  return folderId === defaultFolderId ? "仓库根目录" : title;
}

export function SidebarNoteTree({
  activeFolderId,
  activeNoteId,
  collapsedFolderIds,
  nodes,
  notesById,
  onOpenFolderMenu,
  onOpenNoteMenu,
  onSelectFolder,
  onSelectNote,
  onToggleFolder,
}: SidebarNoteTreeProps) {
  const orderedNodes = orderNoteTreeNodesFoldersFirst(nodes);

  return (
    <>
      {orderedNodes.map((node) => {
        if (node.kind === "folder") {
          const isCollapsed = collapsedFolderIds.has(node.id);
          const hasChildren = node.children.length > 0;
          const title = getFolderDisplayTitle(node.id, node.title);
          const openFolderMenu = (
            event: React.MouseEvent<HTMLDivElement>,
          ) => {
            event.preventDefault();
            event.stopPropagation();
            onSelectFolder(node.id);
            onOpenFolderMenu(node.id, title, {
              x: event.clientX,
              y: event.clientY,
            });
          };

          return (
            <div className="note-folder" key={node.id}>
              <div
                className={
                  node.id === activeFolderId
                    ? "note-folder-row active"
                    : "note-folder-row"
                }
                onContextMenu={openFolderMenu}
              >
                <button
                  aria-label={
                    isCollapsed ? `展开 ${title}` : `折叠 ${title}`
                  }
                  className="note-folder-toggle"
                  disabled={!hasChildren}
                  onClick={() => onToggleFolder(node.id)}
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
                  className="note-folder-label"
                  onClick={() => onSelectFolder(node.id)}
                  title={title}
                  type="button"
                >
                  <Folder aria-hidden="true" size={14} strokeWidth={1.9} />
                  <span>{title}</span>
                  <small>{node.children.length}</small>
                </button>
              </div>
              {!isCollapsed ? (
                <div className="note-folder-children">
                  {hasChildren ? (
                    <SidebarNoteTree
                      activeFolderId={activeFolderId}
                      activeNoteId={activeNoteId}
                      collapsedFolderIds={collapsedFolderIds}
                      nodes={node.children}
                      notesById={notesById}
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

        const note = notesById.get(node.noteId);

        if (!note) {
          return null;
        }

        const openNoteMenu = (event: React.MouseEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenNoteMenu(note.id, note.title, {
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
                note.id === activeNoteId ? "note-item active" : "note-item"
              }
              onClick={() => onSelectNote(note.id)}
              title={note.title}
              type="button"
            >
              <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
              <span>{note.title}</span>
            </button>
          </div>
        );
      })}
    </>
  );
}
