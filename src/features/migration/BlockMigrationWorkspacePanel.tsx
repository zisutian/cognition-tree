import { MoveRight } from "lucide-react";
import type { DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { CtnBlock } from "../../ctn/parseOutline";
import type { NoteId, NoteWorkspace } from "../../domain/notes";
import type {
  MoveWorkspaceBlockActionResult,
  MoveWorkspaceBlockRequest,
} from "../../workspace/useWorkspaceController";
import { resolveParsedNoteView } from "../../workspace/parsedNoteView";
import { previewWorkspaceBlockMigration } from "../../workspace/workspaceBlockMigration";
import type { BlockMigrationPanelStatus } from "./BlockMigrationStatusPanel";

type BlockMigrationWorkspacePanelProps = {
  activeNoteId: NoteId | null;
  onMoveNoteBlock: (request: MoveWorkspaceBlockRequest) => MoveWorkspaceBlockActionResult;
  onResultStatusChange: (status: BlockMigrationPanelStatus | null) => void;
  onSelectionStatusChange: (status: BlockMigrationPanelStatus) => void;
  workspace: NoteWorkspace;
};

const blockDragDataType = "application/x-cognition-tree-block-line";

function parseTargetPosition(value: string): MoveWorkspaceBlockRequest["targetPosition"] {
  if (value === "end") {
    return { kind: "end" };
  }

  return {
    kind: "after-block",
    lineNumber: Number(value.slice("after:".length)),
  };
}

function getBlockTitle(block: CtnBlock) {
  return block.text || block.label;
}

function getBlockLineLabel(block: CtnBlock) {
  return block.lineNumber === block.endLineNumber
    ? `L${block.lineNumber}`
    : `L${block.lineNumber}-${block.endLineNumber}`;
}

function flattenBlockSubtree(block: CtnBlock): CtnBlock[] {
  return [block, ...block.children.flatMap(flattenBlockSubtree)];
}

function MigrationSourceTree({
  draggingLineNumber,
  onDragEnd,
  onDragStart,
  nodes,
  onSelectLine,
  selectedLineNumber,
}: {
  draggingLineNumber: string | null;
  nodes: CtnBlock[];
  onDragEnd: () => void;
  onDragStart: (
    event: DragEvent<HTMLButtonElement>,
    lineNumber: number,
  ) => void;
  onSelectLine: (lineNumber: string) => void;
  selectedLineNumber: string;
}) {
  return (
    <ul className="migration-tree">
      {nodes.map((node) => {
        const isSelected = selectedLineNumber === String(node.lineNumber);
        const isDragging = draggingLineNumber === String(node.lineNumber);
        const hasChildren = node.children.length > 0;

        return (
          <li key={node.id}>
            <button
              className={
                [
                  "migration-tree-node",
                  isSelected ? "is-selected" : "",
                  isDragging ? "is-dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              draggable
              onDragEnd={onDragEnd}
              onDragStart={(event) => onDragStart(event, node.lineNumber)}
              onClick={() => onSelectLine(String(node.lineNumber))}
              title={`${node.label}: ${getBlockTitle(node)}`}
              type="button"
            >
              <span className="migration-node-kind">{node.label}</span>
              <span className="migration-node-text">{getBlockTitle(node)}</span>
              <span className="migration-node-lines">{getBlockLineLabel(node)}</span>
            </button>
            {hasChildren ? (
              <MigrationSourceTree
                draggingLineNumber={draggingLineNumber}
                nodes={node.children}
                onDragEnd={onDragEnd}
                onDragStart={onDragStart}
                onSelectLine={onSelectLine}
                selectedLineNumber={selectedLineNumber}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function MigrationTargetTree({
  activeDropPositionValue,
  nodes,
  onDragLeavePosition,
  onDragOverPosition,
  onDropPosition,
  onSelectAfterBlock,
  selectedPositionValue,
}: {
  activeDropPositionValue: string | null;
  nodes: CtnBlock[];
  onDragLeavePosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onDragOverPosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onDropPosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onSelectAfterBlock: (lineNumber: number) => void;
  selectedPositionValue: string;
}) {
  return (
    <ul className="migration-tree">
      {nodes.map((node) => {
        const positionValue = `after:${node.lineNumber}`;
        const isSelected = selectedPositionValue === positionValue;
        const isDropTarget = activeDropPositionValue === positionValue;
        const hasChildren = node.children.length > 0;

        return (
          <li key={node.id}>
            <div
              className={
                [
                  "migration-tree-node target-node",
                  isSelected ? "is-selected" : "",
                  isDropTarget ? "is-drop-target" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onDragLeave={(event) => onDragLeavePosition(event, positionValue)}
              onDragOver={(event) => onDragOverPosition(event, positionValue)}
              onDrop={(event) => onDropPosition(event, positionValue)}
            >
              <div className="migration-node-main">
                <span className="migration-node-kind">{node.label}</span>
                <span className="migration-node-text">{getBlockTitle(node)}</span>
                <span className="migration-node-lines">{getBlockLineLabel(node)}</span>
              </div>
              <button
                className="migration-node-action"
                onClick={() => onSelectAfterBlock(node.lineNumber)}
                title={`插入到 ${getBlockTitle(node)} 之后`}
                type="button"
              >
                之后
              </button>
            </div>
            {hasChildren ? (
              <MigrationTargetTree
                activeDropPositionValue={activeDropPositionValue}
                nodes={node.children}
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDropPosition={onDropPosition}
                onSelectAfterBlock={onSelectAfterBlock}
                selectedPositionValue={selectedPositionValue}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function BlockMigrationWorkspacePanel({
  activeNoteId,
  onMoveNoteBlock,
  onResultStatusChange,
  onSelectionStatusChange,
  workspace,
}: BlockMigrationWorkspacePanelProps) {
  const notes = workspace.notes;
  const [sourceNoteId, setSourceNoteId] = useState("");
  const [targetNoteId, setTargetNoteId] = useState("");
  const [sourceBlockLineNumber, setSourceBlockLineNumber] = useState("");
  const [targetPositionValue, setTargetPositionValue] = useState("end");
  const [draggingSourceLineNumber, setDraggingSourceLineNumber] =
    useState<string | null>(null);
  const [activeDropPositionValue, setActiveDropPositionValue] =
    useState<string | null>(null);
  const parsedNotesById = useMemo(
    () =>
      new Map(
        notes.map((note) => [
          note.id,
          resolveParsedNoteView(workspace, note),
        ]),
      ),
    [notes, workspace],
  );
  const sourceNote = notes.find((note) => note.id === sourceNoteId) ?? null;
  const targetNote = notes.find((note) => note.id === targetNoteId) ?? null;
  const sourceParsed = sourceNote ? parsedNotesById.get(sourceNote.id) ?? null : null;
  const targetParsed = targetNote ? parsedNotesById.get(targetNote.id) ?? null : null;
  const sourceBlocks =
    sourceParsed?.status === "parsed" ? sourceParsed.document.blocks : [];
  const targetBlocks =
    targetParsed?.status === "parsed" ? targetParsed.document.blocks : [];
  const sourceRoots =
    sourceParsed?.status === "parsed" ? sourceParsed.document.roots : [];
  const targetRoots =
    targetParsed?.status === "parsed" ? targetParsed.document.roots : [];
  const sourceBlock =
    sourceBlocks.find((block) => String(block.lineNumber) === sourceBlockLineNumber) ??
    null;
  const sourceSubtreeBlocks = sourceBlock ? flattenBlockSubtree(sourceBlock) : [];
  const selectedTargetBlock =
    targetPositionValue === "end"
      ? null
      : targetBlocks.find(
          (block) => targetPositionValue === `after:${block.lineNumber}`,
        ) ?? null;
  const sourceBlockLineNumberValue = sourceBlock
    ? Number(sourceBlockLineNumber)
    : null;
  const selectionStatus = previewWorkspaceBlockMigration(workspace, {
    sourceBlockLineNumber: sourceBlockLineNumberValue,
    sourceNoteId: sourceNote?.id ?? null,
    targetNoteId: targetNote?.id ?? null,
    targetPosition: parseTargetPosition(targetPositionValue),
  });
  const selectionStatusDetailsKey = selectionStatus.details?.join("\u0000") ?? "";
  const canMove =
    selectionStatus.status === "ready" &&
    Boolean(sourceNote) &&
    Boolean(targetNote) &&
    sourceNote?.id !== targetNote?.id;

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

  useEffect(() => {
    if (
      sourceBlocks.some((block) => String(block.lineNumber) === sourceBlockLineNumber)
    ) {
      return;
    }

    setSourceBlockLineNumber(
      sourceBlocks[0] ? String(sourceBlocks[0].lineNumber) : "",
    );
  }, [sourceBlockLineNumber, sourceBlocks]);

  useEffect(() => {
    if (
      targetPositionValue === "end" ||
      targetBlocks.some((block) => targetPositionValue === `after:${block.lineNumber}`)
    ) {
      return;
    }

    setTargetPositionValue("end");
  }, [targetBlocks, targetPositionValue]);

  useEffect(() => {
    onSelectionStatusChange(selectionStatus);
  }, [
    notes.length,
    onSelectionStatusChange,
    selectionStatusDetailsKey,
    selectionStatus.message,
    selectionStatus.status,
  ]);

  const moveBlockToPosition = (
    nextSourceBlockLineNumber: string,
    nextTargetPositionValue: string,
  ) => {
    if (!sourceNote || !targetNote || !nextSourceBlockLineNumber) {
      return;
    }

    const result = onMoveNoteBlock({
      sourceBlockLineNumber: Number(nextSourceBlockLineNumber),
      sourceNoteId: sourceNote.id,
      targetNoteId: targetNote.id,
      targetPosition: parseTargetPosition(nextTargetPositionValue),
    });

    onResultStatusChange({
      message: result.message,
      status: result.status === "moved" ? "success" : "failed",
    });
  };
  const moveSelectedBlock = () => {
    moveBlockToPosition(sourceBlockLineNumber, targetPositionValue);
  };
  const selectSourceLine = (lineNumber: string) => {
    setSourceBlockLineNumber(lineNumber);
    onResultStatusChange(null);
  };
  const selectTargetPosition = (positionValue: string) => {
    setTargetPositionValue(positionValue);
    onResultStatusChange(null);
  };
  const startSourceBlockDrag = (
    event: DragEvent<HTMLButtonElement>,
    lineNumber: number,
  ) => {
    const lineNumberValue = String(lineNumber);

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(blockDragDataType, lineNumberValue);
    event.dataTransfer.setData("text/plain", lineNumberValue);
    setDraggingSourceLineNumber(lineNumberValue);
    selectSourceLine(lineNumberValue);
  };
  const finishSourceBlockDrag = () => {
    setDraggingSourceLineNumber(null);
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

    const lineNumberValue =
      event.dataTransfer.getData(blockDragDataType) ||
      event.dataTransfer.getData("text/plain") ||
      draggingSourceLineNumber;

    if (!lineNumberValue) {
      finishSourceBlockDrag();
      return;
    }

    setSourceBlockLineNumber(lineNumberValue);
    setTargetPositionValue(positionValue);
    moveBlockToPosition(lineNumberValue, positionValue);
    finishSourceBlockDrag();
  };

  return (
    <section className="workspace-main-panel migration-workspace-panel" aria-label="块迁移">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Block Migration</p>
          <h2>块迁移</h2>
        </div>
        <button
          className="primary-action-button"
          disabled={!canMove}
          onClick={moveSelectedBlock}
          type="button"
        >
          <MoveRight aria-hidden="true" size={14} strokeWidth={2} />
          移动块
        </button>
      </header>

      <div className="migration-workspace-grid">
        <section className="migration-workspace-column">
          <p className="workspace-detail-title">源</p>
          <select
            className="workspace-select"
            value={sourceNoteId}
            onChange={(event) => {
              setSourceNoteId(event.target.value);
              onResultStatusChange(null);
            }}
          >
            {notes.map((note) => (
              <option key={note.id} value={note.id}>
                {note.title}
              </option>
            ))}
          </select>
          <div className="migration-tree-panel">
            {sourceRoots.length > 0 ? (
              <MigrationSourceTree
                draggingLineNumber={draggingSourceLineNumber}
                nodes={sourceRoots}
                onDragEnd={finishSourceBlockDrag}
                onDragStart={startSourceBlockDrag}
                onSelectLine={selectSourceLine}
                selectedLineNumber={sourceBlockLineNumber}
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
          <p className="workspace-detail-title">目标</p>
          <select
            className="workspace-select"
            value={targetNoteId}
            onChange={(event) => {
              setTargetNoteId(event.target.value);
              onResultStatusChange(null);
            }}
          >
            {notes
              .filter((note) => note.id !== sourceNoteId)
              .map((note) => (
                <option key={note.id} value={note.id}>
                  {note.title}
                </option>
              ))}
          </select>
          <div className="migration-tree-panel">
            <button
              className={
                [
                  "migration-position-card",
                  targetPositionValue === "end" ? "is-selected" : "",
                  activeDropPositionValue === "end" ? "is-drop-target" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onDragLeave={(event) => dragLeaveTargetPosition(event, "end")}
              onDragOver={(event) => dragOverTargetPosition(event, "end")}
              onDrop={(event) => dropOnTargetPosition(event, "end")}
              onClick={() => selectTargetPosition("end")}
              type="button"
            >
              文末，作为根块
            </button>
            {targetRoots.length > 0 ? (
              <MigrationTargetTree
                activeDropPositionValue={activeDropPositionValue}
                nodes={targetRoots}
                onDragLeavePosition={dragLeaveTargetPosition}
                onDragOverPosition={dragOverTargetPosition}
                onDropPosition={dropOnTargetPosition}
                onSelectAfterBlock={(lineNumber) =>
                  selectTargetPosition(`after:${lineNumber}`)
                }
                selectedPositionValue={targetPositionValue}
              />
            ) : (
              <p className="migration-empty-state">目标笔记没有结构，当前只能插入文末。</p>
            )}
          </div>
          <section className="migration-selection-card">
            <p className="workspace-detail-title">目标插入位置</p>
            {targetPositionValue === "end" ? (
              <p>插入到目标笔记文末，作为根块。</p>
            ) : selectedTargetBlock ? (
              <p>
                插入到 {getBlockLineLabel(selectedTargetBlock)} ·{" "}
                {getBlockTitle(selectedTargetBlock)} 的整棵子树之后。
              </p>
            ) : (
              <p>目标插入位置不存在。</p>
            )}
          </section>
        </section>
      </div>
    </section>
  );
}
