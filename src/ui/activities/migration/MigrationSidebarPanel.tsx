import type { DragEvent } from "react";
import {
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  UiFolderId,
  UiNoteId,
  UiTreeNode,
} from "../../../application/workspace/projection/viewTree";
import {
  createMigrationNoteDragPayload,
  createMigrationNoteDragSession,
  migrationNoteDragDataType,
  readMigrationNoteDragPayload,
  resolveMigrationNoteDropPair,
} from "./migrationNoteDrag";
import {
  collectMigrationNoteIds,
  MigrationNoteTree,
} from "./MigrationNoteTree";

type MigrationSidebarPanelProps = {
  mode: "pair" | "structure";
  noteTree: UiTreeNode[];
  sourceNoteId: UiNoteId;
  structureNoteId: UiNoteId;
  targetNoteId: UiNoteId;
  onOpenNoteStructure: (noteId: UiNoteId) => void;
  onPairNotesForMigration: (
    sourceNoteId: UiNoteId,
    targetNoteId: UiNoteId,
  ) => void;
};

export function MigrationSidebarPanel({
  mode,
  noteTree,
  sourceNoteId,
  structureNoteId,
  targetNoteId,
  onOpenNoteStructure,
  onPairNotesForMigration,
}: MigrationSidebarPanelProps) {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<
    Set<UiFolderId>
  >(() => new Set());
  const [draggingNoteId, setDraggingNoteId] = useState<UiNoteId | null>(null);
  const [activeDropNoteId, setActiveDropNoteId] =
    useState<UiNoteId | null>(null);
  const dragSession = useRef(createMigrationNoteDragSession());
  const noteIds = useMemo(() => collectMigrationNoteIds(noteTree), [noteTree]);

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
  const readDraggedNoteId = (event: DragEvent<HTMLButtonElement>) =>
    readMigrationNoteDragPayload({
      plainText: event.dataTransfer.getData("text/plain"),
      typedPayload:
        event.dataTransfer.getData(migrationNoteDragDataType) ||
        dragSession.current.read(),
    });
  const clearDragState = () => {
    dragSession.current.clear();
    setDraggingNoteId(null);
    setActiveDropNoteId(null);
  };
  const startNoteDrag = (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => {
    const payload = createMigrationNoteDragPayload(noteId);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(migrationNoteDragDataType, payload);
    event.dataTransfer.setData("text/plain", payload);
    dragSession.current.write(payload);
    setDraggingNoteId(noteId);
  };
  const dragOverNote = (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => {
    const draggedNoteId = readDraggedNoteId(event);
    const dropPair = resolveMigrationNoteDropPair({
      noteIds,
      sourceNoteId: draggedNoteId,
      targetNoteId: noteId,
    });

    if (!dropPair) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setActiveDropNoteId(noteId);
  };
  const dragLeaveNote = (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setActiveDropNoteId((current) => (current === noteId ? null : current));
  };
  const dropNote = (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => {
    event.preventDefault();

    const draggedNoteId = readDraggedNoteId(event);
    const dropPair = resolveMigrationNoteDropPair({
      noteIds,
      sourceNoteId: draggedNoteId,
      targetNoteId: noteId,
    });

    if (dropPair) {
      onPairNotesForMigration(dropPair.sourceNoteId, dropPair.targetNoteId);
    }

    clearDragState();
  };

  return (
    <div className="side-panel-body">
      <section className="side-section notes-section migration-note-tree">
        <div className="side-section-header">
          <p className="side-section-title">迁移目录</p>
        </div>
        <div className="sidebar-scroll-area">
          <div className="sidebar-scroll-area-viewport">
            <div className="sidebar-scroll-area-content note-tree note-tree-content migration-note-tree-content">
              {noteTree.length > 0 ? (
                <MigrationNoteTree
                  activeDropNoteId={activeDropNoteId}
                  collapsedFolderIds={collapsedFolderIds}
                  draggingNoteId={draggingNoteId}
                  mode={mode}
                  noteIds={noteIds}
                  nodes={noteTree}
                  sourceNoteId={sourceNoteId}
                  structureNoteId={structureNoteId}
                  targetNoteId={targetNoteId}
                  onDragEnd={clearDragState}
                  onDragLeaveNote={dragLeaveNote}
                  onDragOverNote={dragOverNote}
                  onDragStartNote={startNoteDrag}
                  onDropNote={dropNote}
                  onOpenNoteStructure={onOpenNoteStructure}
                  onToggleFolder={toggleFolder}
                />
              ) : (
                <p className="side-muted">没有可迁移笔记。</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
