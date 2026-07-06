import {
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { DragEvent } from "react";
import type {
  UiFolderId,
  UiNoteId,
  UiTreeNode,
} from "../../../application/workspace/projection/viewTree";

type MigrationNoteTreeProps = {
  collapsedFolderIds: Set<UiFolderId>;
  draggingNoteId: UiNoteId | null;
  mode: "pair" | "structure";
  noteIds: Set<UiNoteId>;
  activeDropNoteId: UiNoteId | null;
  nodes: UiTreeNode[];
  sourceNoteId: UiNoteId;
  structureNoteId: UiNoteId;
  targetNoteId: UiNoteId;
  onDragEnd: () => void;
  onDragLeaveNote: (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => void;
  onDragOverNote: (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => void;
  onDragStartNote: (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => void;
  onDropNote: (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => void;
  onOpenNoteStructure: (noteId: UiNoteId) => void;
  onToggleFolder: (folderId: UiFolderId) => void;
};

export function collectMigrationNoteIds(
  nodes: UiTreeNode[],
  noteIds = new Set<UiNoteId>(),
) {
  nodes.forEach((node) => {
    if (node.kind === "note") {
      noteIds.add(node.noteId);
      return;
    }

    collectMigrationNoteIds(node.children, noteIds);
  });

  return noteIds;
}

export function MigrationNoteTree({
  activeDropNoteId,
  collapsedFolderIds,
  draggingNoteId,
  mode,
  noteIds,
  nodes,
  sourceNoteId,
  structureNoteId,
  targetNoteId,
  onDragEnd,
  onDragLeaveNote,
  onDragOverNote,
  onDragStartNote,
  onDropNote,
  onOpenNoteStructure,
  onToggleFolder,
}: MigrationNoteTreeProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "folder") {
          const isCollapsed = collapsedFolderIds.has(node.folderId);
          const hasChildren = node.children.length > 0;

          return (
            <div className="note-folder migration-note-folder" key={node.id}>
              <div className="ctn-tree-row migration-note-folder-row">
                <button
                  aria-expanded={hasChildren ? !isCollapsed : undefined}
                  className="ctn-tree-main ctn-tree-main-label ctn-tree-main-compact note-folder-label migration-note-folder-button"
                  disabled={!hasChildren}
                  onClick={() => onToggleFolder(node.folderId)}
                  title={node.title}
                  type="button"
                >
                  <span className="ctn-tree-toggle migration-note-folder-toggle">
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
              </div>
              {!isCollapsed && hasChildren ? (
                <div className="ctn-tree-children note-folder-children">
                  <MigrationNoteTree
                    activeDropNoteId={activeDropNoteId}
                    collapsedFolderIds={collapsedFolderIds}
                    draggingNoteId={draggingNoteId}
                    mode={mode}
                    noteIds={noteIds}
                    nodes={node.children}
                    sourceNoteId={sourceNoteId}
                    structureNoteId={structureNoteId}
                    targetNoteId={targetNoteId}
                    onDragEnd={onDragEnd}
                    onDragLeaveNote={onDragLeaveNote}
                    onDragOverNote={onDragOverNote}
                    onDragStartNote={onDragStartNote}
                    onDropNote={onDropNote}
                    onOpenNoteStructure={onOpenNoteStructure}
                    onToggleFolder={onToggleFolder}
                  />
                </div>
              ) : null}
            </div>
          );
        }

        if (!noteIds.has(node.noteId)) {
          return null;
        }

        const isSource = mode === "pair" && node.noteId === sourceNoteId;
        const isStructure =
          mode === "structure" && node.noteId === structureNoteId;
        const isTarget = mode === "pair" && node.noteId === targetNoteId;
        const isDragging = node.noteId === draggingNoteId;
        const isDropTarget = node.noteId === activeDropNoteId;

        return (
          <div className="note-tree-node-frame note-item-row" key={node.id}>
            <div
              className={
                [
                  "ctn-tree-row note-item-row-content migration-note-row",
                  isSource ? "is-source" : "",
                  isStructure ? "is-structure" : "",
                  isTarget ? "is-target" : "",
                  isDragging ? "is-dragging" : "",
                  isDropTarget ? "is-drop-target" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
            >
              <button
                className="ctn-tree-main ctn-tree-main-note note-item migration-note-button"
                draggable={node.canDrag}
                onClick={() => onOpenNoteStructure(node.noteId)}
                onDragEnd={onDragEnd}
                onDragLeave={(event) => onDragLeaveNote(event, node.noteId)}
                onDragOver={(event) => onDragOverNote(event, node.noteId)}
                onDragStart={(event) => onDragStartNote(event, node.noteId)}
                onDrop={(event) => onDropNote(event, node.noteId)}
                title={node.title}
                type="button"
              >
                <span className="ctn-tree-text">{node.title}</span>
                {isSource ? (
                  <span className="migration-note-badge">源</span>
                ) : null}
                {isStructure ? (
                  <span className="migration-note-badge">结构</span>
                ) : null}
                {isTarget ? (
                  <span className="migration-note-badge">目标</span>
                ) : null}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
