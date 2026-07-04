import type { Dispatch, DragEvent, SetStateAction } from "react";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import {
  type FolderId,
  type NoteId,
  type NoteTreeNode,
} from "../../workspace/model/workspaceData";
import {
  createWorkspaceNoteSelectionTree,
  getWorkspaceFolderChildCount,
  getWorkspaceFolderDisplayTitle,
  hasWorkspaceFolderChildren,
  orderWorkspaceTreeNodesFoldersFirst,
} from "../../workspace/queries/workspaceQueries";

type MigrationSelectableNote = {
  id: NoteId;
  title: string;
};

type NoteSelectionViewProps = {
  notes: MigrationSelectableNote[];
  noteTree: NoteTreeNode[];
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  onSourceNoteChange: (id: NoteId) => void;
  onTargetNoteChange: (id: NoteId) => void;
  onComplete: () => void;
};

type MigrationNoteTreeMode = "source" | "target";

type MigrationNoteTreeProps = {
  collapsedFolderIds: Set<FolderId>;
  dragOverNoteId: NoteId | null;
  mode: MigrationNoteTreeMode;
  nodes: NoteTreeNode[];
  notesById: Map<NoteId, MigrationSelectableNote>;
  onSourceDragStart: (
    event: DragEvent<HTMLButtonElement>,
    noteId: NoteId,
  ) => void;
  onSourceNoteChange: (id: NoteId) => void;
  onTargetDragLeave: () => void;
  onTargetDragOver: (
    event: DragEvent<HTMLButtonElement>,
    noteId: NoteId,
  ) => void;
  onTargetDrop: (
    event: DragEvent<HTMLButtonElement>,
    noteId: NoteId,
  ) => void;
  onTargetNoteChange: (id: NoteId) => void;
  onToggleFolder: (folderId: FolderId) => void;
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  visitedNodeIds?: Set<string>;
};

function MigrationNoteTree({
  collapsedFolderIds,
  dragOverNoteId,
  mode,
  nodes,
  notesById,
  onSourceDragStart,
  onSourceNoteChange,
  onTargetDragLeave,
  onTargetDragOver,
  onTargetDrop,
  onTargetNoteChange,
  onToggleFolder,
  sourceNoteId,
  targetNoteId,
  visitedNodeIds = new Set(),
}: MigrationNoteTreeProps) {
  const orderedNodes = orderWorkspaceTreeNodesFoldersFirst(nodes);

  return (
    <ol className="ctn-tree-list">
      {orderedNodes.map((node) => {
        if (visitedNodeIds.has(node.id)) {
          return null;
        }

        if (node.kind === "folder") {
          const isCollapsed = collapsedFolderIds.has(node.id);
          const hasChildren = hasWorkspaceFolderChildren(node);
          const title = getWorkspaceFolderDisplayTitle(node.id, node.title);
          const nextVisitedNodeIds = new Set(visitedNodeIds);

          nextVisitedNodeIds.add(node.id);

          return (
            <li key={node.id}>
              <div className="ctn-tree-row ctn-tree-row-with-toggle migration-note-folder-row">
                <button
                  aria-label={
                    isCollapsed ? `展开 ${title}` : `折叠 ${title}`
                  }
                  className="ctn-tree-toggle migration-note-folder-toggle"
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
                  className="ctn-tree-main ctn-tree-main-with-meta ctn-tree-main-compact migration-note-folder-label"
                  onClick={() => onToggleFolder(node.id)}
                  title={title}
                  type="button"
                >
                  <Folder aria-hidden="true" size={14} strokeWidth={1.9} />
                  <span className="ctn-tree-text">{title}</span>
                  <small className="ctn-tree-meta">
                    {getWorkspaceFolderChildCount(node)}
                  </small>
                </button>
              </div>
              {!isCollapsed && hasChildren ? (
                <MigrationNoteTree
                  collapsedFolderIds={collapsedFolderIds}
                  dragOverNoteId={dragOverNoteId}
                  mode={mode}
                  nodes={node.children}
                  notesById={notesById}
                  onSourceDragStart={onSourceDragStart}
                  onSourceNoteChange={onSourceNoteChange}
                  onTargetDragLeave={onTargetDragLeave}
                  onTargetDragOver={onTargetDragOver}
                  onTargetDrop={onTargetDrop}
                  onTargetNoteChange={onTargetNoteChange}
                  onToggleFolder={onToggleFolder}
                  sourceNoteId={sourceNoteId}
                  targetNoteId={targetNoteId}
                  visitedNodeIds={nextVisitedNodeIds}
                />
              ) : null}
            </li>
          );
        }

        const note = notesById.get(node.noteId);

        if (!note || (mode === "target" && note.id === sourceNoteId)) {
          return null;
        }

        if (mode === "source") {
          return (
            <li key={node.id}>
              <button
                className={`ctn-tree-main ctn-tree-main-note migration-note-row ${
                  note.id === sourceNoteId ? "is-source is-active" : ""
                }`}
                draggable
                onClick={() => onSourceNoteChange(note.id)}
                onDragStart={(event) => onSourceDragStart(event, note.id)}
                title={note.title}
                type="button"
              >
                <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
                <span className="ctn-tree-text">{note.title}</span>
              </button>
            </li>
          );
        }

        return (
          <li key={node.id}>
            <button
              className={`ctn-tree-main ctn-tree-main-note migration-note-row ${
                note.id === targetNoteId ? "is-target is-active" : ""
              } ${note.id === dragOverNoteId ? "is-drop-target" : ""}`}
              onClick={() => onTargetNoteChange(note.id)}
              onDragLeave={onTargetDragLeave}
              onDragOver={(event) => onTargetDragOver(event, note.id)}
              onDrop={(event) => onTargetDrop(event, note.id)}
              title={note.title}
              type="button"
            >
              <FileText aria-hidden="true" size={14} strokeWidth={1.9} />
              <span className="ctn-tree-text">{note.title}</span>
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
  const [dragOverNoteId, setDragOverNoteId] = useState<NoteId | null>(null);
  const [collapsedSourceFolderIds, setCollapsedSourceFolderIds] = useState<
    Set<FolderId>
  >(() => new Set());
  const [collapsedTargetFolderIds, setCollapsedTargetFolderIds] = useState<
    Set<FolderId>
  >(() => new Set());
  const notesById = useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes],
  );
  const selectionTree = useMemo(
    () => createWorkspaceNoteSelectionTree(notes, noteTree),
    [noteTree, notes],
  );
  const hasTargetCandidates = notes.some((note) => note.id !== sourceNoteId);

  const toggleFolder = (
    folderId: FolderId,
    setCollapsedFolderIds: Dispatch<SetStateAction<Set<FolderId>>>,
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
    noteId: NoteId,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", noteId);
    onSourceNoteChange(noteId);
  };

  const handleTargetDragOver = (
    event: DragEvent<HTMLButtonElement>,
    noteId: NoteId,
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
    noteId: NoteId,
  ) => {
    event.preventDefault();
    setDragOverNoteId(null);

    const droppedSourceId = event.dataTransfer.getData("text/plain");
    if (!droppedSourceId || droppedSourceId === noteId) return;

    onSourceNoteChange(droppedSourceId);
    onTargetNoteChange(noteId);
    onComplete();
  };

  return (
    <div className="migration-note-grid">
      <section className="migration-workspace-column">
        <p className="workspace-detail-title">源笔记（拖拽到目标）</p>
        <div className="migration-note-list">
          {notes.length > 0 ? (
            <MigrationNoteTree
              collapsedFolderIds={collapsedSourceFolderIds}
              dragOverNoteId={dragOverNoteId}
              mode="source"
              nodes={selectionTree}
              notesById={notesById}
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

      <section className="migration-workspace-column">
        <p className="workspace-detail-title">目标笔记（拖放到此处）</p>
        <div className="migration-note-list">
          {hasTargetCandidates ? (
            <MigrationNoteTree
              collapsedFolderIds={collapsedTargetFolderIds}
              dragOverNoteId={dragOverNoteId}
              mode="target"
              nodes={selectionTree}
              notesById={notesById}
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
