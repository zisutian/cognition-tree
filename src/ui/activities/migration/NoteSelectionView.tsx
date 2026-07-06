import type { Dispatch, DragEvent, SetStateAction } from "react";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import type {
  UiFolderId,
  UiNoteId,
  UiNoteSummary,
  UiTreeNode,
} from "../../../application/workspace/viewTypes";

type NoteSelectionViewProps = {
  notes: UiNoteSummary[];
  noteTree: UiTreeNode[];
  sourceNoteId: UiNoteId;
  targetNoteId: UiNoteId;
  onSourceNoteChange: (id: UiNoteId) => void;
  onTargetNoteChange: (id: UiNoteId) => void;
  onComplete: () => void;
};

type MigrationNoteTreeMode = "source" | "target";

type MigrationNoteTreeProps = {
  collapsedFolderIds: Set<UiFolderId>;
  dragOverNoteId: UiNoteId | null;
  mode: MigrationNoteTreeMode;
  nodes: UiTreeNode[];
  noteIds: Set<UiNoteId>;
  onSourceDragStart: (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => void;
  onSourceNoteChange: (id: UiNoteId) => void;
  onTargetDragLeave: () => void;
  onTargetDragOver: (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => void;
  onTargetDrop: (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => void;
  onTargetNoteChange: (id: UiNoteId) => void;
  onToggleFolder: (folderId: UiFolderId) => void;
  sourceNoteId: UiNoteId;
  targetNoteId: UiNoteId;
};

function MigrationNoteTree({
  collapsedFolderIds,
  dragOverNoteId,
  mode,
  nodes,
  noteIds,
  onSourceDragStart,
  onSourceNoteChange,
  onTargetDragLeave,
  onTargetDragOver,
  onTargetDrop,
  onTargetNoteChange,
  onToggleFolder,
  sourceNoteId,
  targetNoteId,
}: MigrationNoteTreeProps) {
  return (
    <ol className="ctn-tree-list">
      {nodes.map((node) => {
        if (node.kind === "folder") {
          const isCollapsed = collapsedFolderIds.has(node.folderId);
          const hasChildren = node.children.length > 0;

          return (
            <li key={node.id}>
              <div className="ctn-tree-row ctn-tree-row-with-toggle migration-note-folder-row">
                <button
                  aria-label={
                    isCollapsed ? `展开 ${node.title}` : `折叠 ${node.title}`
                  }
                  className="ctn-tree-toggle migration-note-folder-toggle"
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
                  className="ctn-tree-main ctn-tree-main-with-meta ctn-tree-main-compact migration-note-folder-label"
                  onClick={() => onToggleFolder(node.folderId)}
                  title={node.title}
                  type="button"
                >
                  <Folder aria-hidden="true" size={14} strokeWidth={1.9} />
                  <span className="ctn-tree-text">{node.title}</span>
                  <small className="ctn-tree-meta">{node.childCount}</small>
                </button>
              </div>
              {!isCollapsed && hasChildren ? (
                <MigrationNoteTree
                  collapsedFolderIds={collapsedFolderIds}
                  dragOverNoteId={dragOverNoteId}
                  mode={mode}
                  nodes={node.children}
                  noteIds={noteIds}
                  onSourceDragStart={onSourceDragStart}
                  onSourceNoteChange={onSourceNoteChange}
                  onTargetDragLeave={onTargetDragLeave}
                  onTargetDragOver={onTargetDragOver}
                  onTargetDrop={onTargetDrop}
                  onTargetNoteChange={onTargetNoteChange}
                  onToggleFolder={onToggleFolder}
                  sourceNoteId={sourceNoteId}
                  targetNoteId={targetNoteId}
                />
              ) : null}
            </li>
          );
        }

        if (!noteIds.has(node.noteId) || (mode === "target" && node.noteId === sourceNoteId)) {
          return null;
        }

        if (mode === "source") {
          return (
            <li key={node.id}>
              <button
                className={`ctn-tree-main ctn-tree-main-note migration-note-row ${
                  node.noteId === sourceNoteId ? "is-source is-active" : ""
                }`}
                draggable
                onClick={() => onSourceNoteChange(node.noteId)}
                onDragStart={(event) => onSourceDragStart(event, node.noteId)}
                title={node.title}
                type="button"
              >
                <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
                <span className="ctn-tree-text">{node.title}</span>
              </button>
            </li>
          );
        }

        return (
          <li key={node.id}>
            <button
              className={`ctn-tree-main ctn-tree-main-note migration-note-row ${
                node.noteId === targetNoteId ? "is-target is-active" : ""
              } ${node.noteId === dragOverNoteId ? "is-drop-target" : ""}`}
              onClick={() => onTargetNoteChange(node.noteId)}
              onDragLeave={onTargetDragLeave}
              onDragOver={(event) => onTargetDragOver(event, node.noteId)}
              onDrop={(event) => onTargetDrop(event, node.noteId)}
              title={node.title}
              type="button"
            >
              <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
              <span className="ctn-tree-text">{node.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function NoteSelectionView({
  notes,
  noteTree,
  sourceNoteId,
  targetNoteId,
  onSourceNoteChange,
  onTargetNoteChange,
  onComplete,
}: NoteSelectionViewProps) {
  const [dragOverNoteId, setDragOverNoteId] = useState<UiNoteId | null>(null);
  const [collapsedSourceFolderIds, setCollapsedSourceFolderIds] = useState<
    Set<UiFolderId>
  >(() => new Set());
  const [collapsedTargetFolderIds, setCollapsedTargetFolderIds] = useState<
    Set<UiFolderId>
  >(() => new Set());
  const noteIds = useMemo(
    () => new Set(notes.map((note) => note.id)),
    [notes],
  );
  const hasTargetCandidates = notes.some((note) => note.id !== sourceNoteId);

  const toggleFolder = (
    folderId: UiFolderId,
    setCollapsedFolderIds: Dispatch<SetStateAction<Set<UiFolderId>>>,
  ) => {
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

  const handleSourceDragStart = (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", noteId);
    onSourceNoteChange(noteId);
  };

  const handleTargetDragOver = (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => {
    if (noteId === sourceNoteId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverNoteId(noteId);
  };

  const handleTargetDragLeave = () => {
    setDragOverNoteId(null);
  };

  const handleTargetDrop = (
    event: DragEvent<HTMLButtonElement>,
    noteId: UiNoteId,
  ) => {
    event.preventDefault();
    setDragOverNoteId(null);

    const droppedSourceId = event.dataTransfer.getData("text/plain");
    if (
      !droppedSourceId ||
      droppedSourceId === noteId ||
      !noteIds.has(droppedSourceId)
    ) {
      return;
    }

    onSourceNoteChange(droppedSourceId);
    onTargetNoteChange(noteId);
    onComplete();
  };

  return (
    <div className="migration-note-grid">
      <section className="migration-column">
        <p className="activity-detail-title">源笔记（拖拽到目标）</p>
        <div className="migration-note-list">
          {notes.length > 0 ? (
            <MigrationNoteTree
              collapsedFolderIds={collapsedSourceFolderIds}
              dragOverNoteId={dragOverNoteId}
              mode="source"
              nodes={noteTree}
              noteIds={noteIds}
              onSourceDragStart={handleSourceDragStart}
              onSourceNoteChange={onSourceNoteChange}
              onTargetDragLeave={handleTargetDragLeave}
              onTargetDragOver={handleTargetDragOver}
              onTargetDrop={handleTargetDrop}
              onTargetNoteChange={onTargetNoteChange}
              onToggleFolder={(folderId) =>
                toggleFolder(folderId, setCollapsedSourceFolderIds)
              }
              sourceNoteId={sourceNoteId}
              targetNoteId={targetNoteId}
            />
          ) : (
            <p className="migration-empty-state">没有可选择的源笔记。</p>
          )}
        </div>
      </section>

      <section className="migration-column">
        <p className="activity-detail-title">目标笔记（拖放到此处）</p>
        <div className="migration-note-list">
          {hasTargetCandidates ? (
            <MigrationNoteTree
              collapsedFolderIds={collapsedTargetFolderIds}
              dragOverNoteId={dragOverNoteId}
              mode="target"
              nodes={noteTree}
              noteIds={noteIds}
              onSourceDragStart={handleSourceDragStart}
              onSourceNoteChange={onSourceNoteChange}
              onTargetDragLeave={handleTargetDragLeave}
              onTargetDragOver={handleTargetDragOver}
              onTargetDrop={handleTargetDrop}
              onTargetNoteChange={onTargetNoteChange}
              onToggleFolder={(folderId) =>
                toggleFolder(folderId, setCollapsedTargetFolderIds)
              }
              sourceNoteId={sourceNoteId}
              targetNoteId={targetNoteId}
            />
          ) : (
            <p className="migration-empty-state">没有可选择的目标笔记。</p>
          )}
        </div>
      </section>
    </div>
  );
}
