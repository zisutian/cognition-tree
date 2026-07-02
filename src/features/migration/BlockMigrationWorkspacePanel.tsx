import type { DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { NoteId, NoteWorkspace } from "../../domain/notes";
import { resolveParsedNoteView } from "../../workspace/parsedNoteView";
import {
  type WorkspaceBlockMigrationRequest,
} from "../../workspace/workspaceBlockMigration";
import {
  flattenBlockSubtree,
  getBlockLineLabel,
  getBlockTitle,
  getTargetPositionLabel,
} from "./blockMigrationView";
import {
  blockDragDataType,
  createBlockDragLineNumberPayload,
  parseBlockMigrationTargetPosition,
  readBlockDragLineNumberPayload,
} from "./blockMigrationDrag";
import { MigrationSourceTree } from "./MigrationSourceTree";
import {
  MigrationDropZone,
  MigrationTargetTree,
} from "./MigrationTargetTree";

type MigrationMode = "note" | "block";

type BlockMigrationWorkspacePanelProps = {
  activeNoteId: NoteId | null;
  onMoveNoteBlock: (request: WorkspaceBlockMigrationRequest) => {
    message: string;
    status: "failed" | "moved";
  };
  workspace: NoteWorkspace;
};

function NoteSelectionView({
  notes,
  sourceNoteId,
  targetNoteId,
  onSourceNoteChange,
  onTargetNoteChange,
  onComplete,
}: {
  notes: Array<{ id: NoteId; title: string }>;
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  onSourceNoteChange: (id: NoteId) => void;
  onTargetNoteChange: (id: NoteId) => void;
  onComplete: () => void;
}) {
  const [dragOverNoteId, setDragOverNoteId] = useState<NoteId | null>(null);

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
        <ol className="migration-note-list">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                draggable
                className={`migration-note-row ${note.id === sourceNoteId ? "is-source" : ""}`}
                onDragStart={(event) => handleSourceDragStart(event, note.id)}
              >
                {note.title}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="migration-workspace-column">
        <p className="workspace-detail-title">目标笔记（拖放到此处）</p>
        <ol className="migration-note-list">
          {notes
            .filter((note) => note.id !== sourceNoteId)
            .map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  className={`migration-note-row ${note.id === targetNoteId ? "is-target" : ""} ${note.id === dragOverNoteId ? "is-drop-target" : ""}`}
                  onDragOver={(event) => handleTargetDragOver(event, note.id)}
                  onDragLeave={handleTargetDragLeave}
                  onDrop={(event) => handleTargetDrop(event, note.id)}
                >
                  {note.title}
                </button>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
}

function BlockMigrationView({
  onMoveNoteBlock,
  sourceNoteId,
  targetNoteId,
  workspace,
}: {
  onMoveNoteBlock: (request: WorkspaceBlockMigrationRequest) => {
    message: string;
    status: "failed" | "moved";
  };
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  workspace: NoteWorkspace;
}) {
  const [sourceBlockLineNumber, setSourceBlockLineNumber] = useState("");
  const [draggingSourceLineNumber, setDraggingSourceLineNumber] =
    useState<string | null>(null);
  const [activeDropPositionValue, setActiveDropPositionValue] =
    useState<string | null>(null);
  const [activeTargetBlockLineNumber, setActiveTargetBlockLineNumber] =
    useState<number | null>(null);
  const sourceNote = workspace.notes.find((note) => note.id === sourceNoteId) ?? null;
  const targetNote = workspace.notes.find((note) => note.id === targetNoteId) ?? null;
  const sourceParsed = useMemo(
    () => (sourceNote ? resolveParsedNoteView(workspace, sourceNote) : null),
    [sourceNote, workspace],
  );
  const targetParsed = useMemo(
    () => (targetNote ? resolveParsedNoteView(workspace, targetNote) : null),
    [targetNote, workspace],
  );
  const sourceBlocks =
    sourceParsed?.status === "parsed" ? sourceParsed.document.blocks : [];
  const sourceRoots =
    sourceParsed?.status === "parsed" ? sourceParsed.document.roots : [];
  const targetRoots =
    targetParsed?.status === "parsed" ? targetParsed.document.roots : [];
  const isDropMode = draggingSourceLineNumber !== null;
  const sourceBlock =
    sourceBlocks.find((block) => String(block.lineNumber) === sourceBlockLineNumber) ??
    null;
  const sourceSubtreeBlocks = sourceBlock ? flattenBlockSubtree(sourceBlock) : [];
  const activeDropLabel = activeDropPositionValue
    ? getTargetPositionLabel(activeDropPositionValue)
    : null;

  const moveBlockToPosition = (
    nextSourceBlockLineNumber: string,
    nextTargetPositionValue: string,
  ) => {
    if (!sourceNote || !targetNote || !nextSourceBlockLineNumber) {
      return;
    }

    onMoveNoteBlock({
      sourceBlockLineNumber: Number(nextSourceBlockLineNumber),
      sourceNoteId: sourceNote.id,
      targetNoteId: targetNote.id,
      targetPosition: parseBlockMigrationTargetPosition(nextTargetPositionValue),
    });
  };
  const startSourceBlockDrag = (
    event: DragEvent<HTMLDivElement>,
    lineNumber: number,
  ) => {
    const lineNumberValue = String(lineNumber);
    const payload = createBlockDragLineNumberPayload(lineNumber);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(blockDragDataType, payload);
    event.dataTransfer.setData("text/plain", payload);
    setDraggingSourceLineNumber(lineNumberValue);
    setSourceBlockLineNumber(lineNumberValue);
  };
  const finishSourceBlockDrag = () => {
    setDraggingSourceLineNumber(null);
    setActiveDropPositionValue(null);
    setActiveTargetBlockLineNumber(null);
  };
  const dragOverTargetBlock = (
    event: DragEvent<HTMLElement>,
    lineNumber: number,
  ) => {
    if (!isDropMode) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setActiveTargetBlockLineNumber(lineNumber);
    setActiveDropPositionValue(null);
  };
  const dragOverTargetPosition = (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setActiveDropPositionValue(positionValue);
  };
  const dragLeaveTargetPosition = (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => {
    const nextTarget = event.relatedTarget;

    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setActiveDropPositionValue((current) =>
      current === positionValue ? null : current,
    );
  };
  const dropOnTargetPosition = (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => {
    event.preventDefault();

    const lineNumberValue = readBlockDragLineNumberPayload({
      fallback: draggingSourceLineNumber,
      plainText: event.dataTransfer.getData("text/plain"),
      typedPayload: event.dataTransfer.getData(blockDragDataType),
    });

    if (!lineNumberValue) {
      finishSourceBlockDrag();
      return;
    }

    setSourceBlockLineNumber(lineNumberValue);
    moveBlockToPosition(lineNumberValue, positionValue);
    finishSourceBlockDrag();
  };

  return (
    <div className="migration-workspace-grid">
      <section className="migration-workspace-column">
        <p className="workspace-detail-title">
          源 · {sourceNote?.title ?? "—"}
        </p>
        <div className="migration-tree-panel">
          {sourceRoots.length > 0 ? (
            <MigrationSourceTree
              draggingLineNumber={draggingSourceLineNumber}
              nodes={sourceRoots}
              onDragEnd={finishSourceBlockDrag}
              onDragStart={startSourceBlockDrag}
            />
          ) : (
            <p className="migration-empty-state">源笔记没有可移动块。</p>
          )}
        </div>
        <section className="migration-selection-card">
          <p className="workspace-detail-title">将移动的子树</p>
          {sourceBlock ? (
            <>
              <p>
                {getBlockLineLabel(sourceBlock)} · {sourceSubtreeBlocks.length} 块
              </p>
              <ul className="migration-subtree-list">
                {sourceSubtreeBlocks.map((block) => (
                  <li key={block.id} style={{ paddingLeft: `${block.level * 12}px` }}>
                    <span>{block.label}</span>
                    <span>{getBlockTitle(block)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>尚未选择源块。</p>
          )}
        </section>
      </section>

      <section className="migration-workspace-column">
        <p className="workspace-detail-title">
          目标 · {targetNote?.title ?? "—"}
        </p>
        <div className="migration-tree-panel">
          {targetRoots.length > 0 ? (
            <MigrationTargetTree
              activeDropPositionValue={activeDropPositionValue}
              activeTargetBlockLineNumber={activeTargetBlockLineNumber}
              isDropMode={isDropMode}
              nodes={targetRoots}
              onDragLeavePosition={dragLeaveTargetPosition}
              onDragOverPosition={dragOverTargetPosition}
              onDragOverTargetBlock={dragOverTargetBlock}
              onDropPosition={dropOnTargetPosition}
            />
          ) : (
            <p className="migration-empty-state">目标笔记没有结构，当前只能插入文末。</p>
          )}
          {isDropMode ? (
            <MigrationDropZone
              activeDropPositionValue={activeDropPositionValue}
              label="文末根块"
              onDragLeavePosition={dragLeaveTargetPosition}
              onDragOverPosition={dragOverTargetPosition}
              onDropPosition={dropOnTargetPosition}
              positionValue="end"
            />
          ) : null}
        </div>
        <section className="migration-selection-card">
          <p className="workspace-detail-title">目标插入位置</p>
          {activeDropLabel ? (
            <p>当前投放位置：{activeDropLabel}。</p>
          ) : (
            <p>拖到目标块后显示上方并列、下方并列和作为子结点投放区。</p>
          )}
        </section>
      </section>
    </div>
  );
}

export function BlockMigrationWorkspacePanel({
  activeNoteId,
  onMoveNoteBlock,
  workspace,
}: BlockMigrationWorkspacePanelProps) {
  const notes = workspace.notes;
  const [mode, setMode] = useState<MigrationMode>("note");
  const [sourceNoteId, setSourceNoteId] = useState("");
  const [targetNoteId, setTargetNoteId] = useState("");

  useEffect(() => {
    if (sourceNoteId && notes.some((note) => note.id === sourceNoteId)) {
      return;
    }

    if (activeNoteId && notes.some((note) => note.id === activeNoteId)) {
      setSourceNoteId(activeNoteId);
      return;
    }

    setSourceNoteId(notes[0]?.id ?? "");
  }, [activeNoteId, notes, sourceNoteId]);

  useEffect(() => {
    if (
      targetNoteId &&
      targetNoteId !== sourceNoteId &&
      notes.some((note) => note.id === targetNoteId)
    ) {
      return;
    }

    setTargetNoteId(
      notes.find((note) => note.id !== sourceNoteId)?.id ?? "",
    );
  }, [notes, sourceNoteId, targetNoteId]);

  const noteRecords = notes.map((note) => ({
    id: note.id,
    title: note.title,
  }));

  return (
    <section className="workspace-main-panel migration-full-width migration-workspace-panel" aria-label="块迁移">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Block Migration</p>
          <h2>块迁移</h2>
        </div>
        <div className="stats">
          <span>拖拽释放即迁移</span>
        </div>
      </header>

      <div className="migration-mode-tabs">
        <button
          type="button"
          className={`migration-mode-tab ${mode === "note" ? "is-active" : ""}`}
          onClick={() => setMode("note")}
        >
          笔记选择
        </button>
        <button
          type="button"
          className={`migration-mode-tab ${mode === "block" ? "is-active" : ""}`}
          onClick={() => setMode("block")}
        >
          块迁移
        </button>
      </div>

      {mode === "note" ? (
        <NoteSelectionView
          notes={noteRecords}
          sourceNoteId={sourceNoteId}
          targetNoteId={targetNoteId}
          onSourceNoteChange={setSourceNoteId}
          onTargetNoteChange={setTargetNoteId}
          onComplete={() => setMode("block")}
        />
      ) : (
        <BlockMigrationView
          onMoveNoteBlock={onMoveNoteBlock}
          sourceNoteId={sourceNoteId}
          targetNoteId={targetNoteId}
          workspace={workspace}
        />
      )}
    </section>
  );
}
