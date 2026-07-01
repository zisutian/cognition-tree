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
import {
  blockDragDataType,
  createBlockDragLineNumberPayload,
  parseBlockMigrationTargetPosition,
  readBlockDragLineNumberPayload,
} from "./blockMigrationDrag";
import type { BlockMigrationPanelStatus } from "./BlockMigrationStatusPanel";

type BlockMigrationWorkspacePanelProps = {
  activeNoteId: NoteId | null;
  onMoveNoteBlock: (request: MoveWorkspaceBlockRequest) => MoveWorkspaceBlockActionResult;
  onResultStatusChange: (status: BlockMigrationPanelStatus | null) => void;
  onSelectionStatusChange: (status: BlockMigrationPanelStatus) => void;
  workspace: NoteWorkspace;
};

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

function getTargetPositionLabel(value: string) {
  if (value === "end") {
    return "文末根块";
  }

  const [kind] = value.split(":");

  switch (kind) {
    case "sibling-above":
      return "上方并列";
    case "sibling-below":
      return "下方并列";
    case "inside":
      return "作为子结点";
    default:
      return "未知位置";
  }
}

function MigrationDropZone({
  activeDropPositionValue,
  isChildZone = false,
  label,
  onDragLeavePosition,
  onDragOverPosition,
  onDropPosition,
  positionValue,
}: {
  activeDropPositionValue: string | null;
  isChildZone?: boolean;
  label: string;
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
  positionValue: string;
}) {
  return (
    <div
      className={
        [
          "migration-drop-zone",
          isChildZone ? "child-zone" : "",
          activeDropPositionValue === positionValue ? "is-drop-target" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      onDragLeave={(event) => onDragLeavePosition(event, positionValue)}
      onDragOver={(event) => onDragOverPosition(event, positionValue)}
      onDrop={(event) => onDropPosition(event, positionValue)}
    >
      {label}
    </div>
  );
}

function MigrationSourceTree({
  draggingLineNumber,
  onDragEnd,
  onDragStart,
  nodes,
}: {
  draggingLineNumber: string | null;
  nodes: CtnBlock[];
  onDragEnd: () => void;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    lineNumber: number,
  ) => void;
}) {
  return (
    <ul className="migration-tree">
      {nodes.map((node) => {
        const isDragging = draggingLineNumber === String(node.lineNumber);
        const hasChildren = node.children.length > 0;

        return (
          <li key={node.id}>
            <div
              className={
                [
                  "migration-tree-node",
                  "source-node",
                  isDragging ? "is-dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              draggable
              onDragEnd={onDragEnd}
              onDragStart={(event) => onDragStart(event, node.lineNumber)}
              title={`${node.label}: ${getBlockTitle(node)}`}
            >
              <span className="migration-node-kind">{node.label}</span>
              <span className="migration-node-text">{getBlockTitle(node)}</span>
              <span className="migration-node-lines">{getBlockLineLabel(node)}</span>
            </div>
            {hasChildren ? (
              <MigrationSourceTree
                draggingLineNumber={draggingLineNumber}
                nodes={node.children}
                onDragEnd={onDragEnd}
                onDragStart={onDragStart}
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
  activeTargetBlockLineNumber,
  isDropMode,
  nodes,
  onDragLeavePosition,
  onDragOverPosition,
  onDragOverTargetBlock,
  onDropPosition,
}: {
  activeDropPositionValue: string | null;
  activeTargetBlockLineNumber: number | null;
  isDropMode: boolean;
  nodes: CtnBlock[];
  onDragLeavePosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onDragOverPosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onDragOverTargetBlock: (
    event: DragEvent<HTMLElement>,
    lineNumber: number,
  ) => void;
  onDropPosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
}) {
  return (
    <ul className="migration-tree">
      {nodes.map((node) => {
        const insidePositionValue = `inside:${node.lineNumber}`;
        const isActiveTarget =
          isDropMode && activeTargetBlockLineNumber === node.lineNumber;
        const hasChildren = node.children.length > 0;

        return (
          <li key={node.id}>
            {isActiveTarget ? (
              <MigrationDropZone
                activeDropPositionValue={activeDropPositionValue}
                label="上方并列"
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDropPosition={onDropPosition}
                positionValue={`sibling-above:${node.lineNumber}`}
              />
            ) : null}
            <div
              className={
                [
                  "migration-tree-node target-node",
                  isActiveTarget ? "is-position-source" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              onDragOver={(event) => onDragOverTargetBlock(event, node.lineNumber)}
            >
              <span className="migration-node-kind">{node.label}</span>
              <span className="migration-node-text">{getBlockTitle(node)}</span>
              <span className="migration-node-lines">{getBlockLineLabel(node)}</span>
            </div>
            {hasChildren ? (
              <MigrationTargetTree
                activeDropPositionValue={activeDropPositionValue}
                activeTargetBlockLineNumber={activeTargetBlockLineNumber}
                isDropMode={isDropMode}
                nodes={node.children}
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDragOverTargetBlock={onDragOverTargetBlock}
                onDropPosition={onDropPosition}
              />
            ) : null}
            {isActiveTarget ? (
              <MigrationDropZone
                activeDropPositionValue={activeDropPositionValue}
                isChildZone
                label="作为子结点"
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDropPosition={onDropPosition}
                positionValue={insidePositionValue}
              />
            ) : null}
            {isActiveTarget ? (
              <MigrationDropZone
                activeDropPositionValue={activeDropPositionValue}
                label="下方并列"
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDropPosition={onDropPosition}
                positionValue={`sibling-below:${node.lineNumber}`}
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
  const [draggingSourceLineNumber, setDraggingSourceLineNumber] =
    useState<string | null>(null);
  const [activeDropPositionValue, setActiveDropPositionValue] =
    useState<string | null>(null);
  const [activeTargetBlockLineNumber, setActiveTargetBlockLineNumber] =
    useState<number | null>(null);
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
  const sourceRoots =
    sourceParsed?.status === "parsed" ? sourceParsed.document.roots : [];
  const targetRoots =
    targetParsed?.status === "parsed" ? targetParsed.document.roots : [];
  const isDropMode = draggingSourceLineNumber !== null;
  const sourceBlock =
    sourceBlocks.find((block) => String(block.lineNumber) === sourceBlockLineNumber) ??
    null;
  const sourceSubtreeBlocks = sourceBlock ? flattenBlockSubtree(sourceBlock) : [];
  const sourceBlockLineNumberValue = sourceBlock
    ? Number(sourceBlockLineNumber)
    : null;
  const selectionStatus = activeDropPositionValue
    ? previewWorkspaceBlockMigration(workspace, {
        sourceBlockLineNumber: sourceBlockLineNumberValue,
        sourceNoteId: sourceNote?.id ?? null,
        targetNoteId: targetNote?.id ?? null,
        targetPosition: parseBlockMigrationTargetPosition(activeDropPositionValue),
      })
    : {
        message: "拖动源笔记中的块到目标笔记的投放区域。",
        status: "idle" as const,
      };
  const selectionStatusDetailsKey = selectionStatus.details?.join("\u0000") ?? "";
  const activeDropLabel = activeDropPositionValue
    ? getTargetPositionLabel(activeDropPositionValue)
    : null;
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

    setSourceBlockLineNumber("");
  }, [sourceBlockLineNumber, sourceBlocks]);

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
      targetPosition: parseBlockMigrationTargetPosition(nextTargetPositionValue),
    });

    onResultStatusChange({
      message: result.message,
      status: result.status === "moved" ? "success" : "failed",
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
    onResultStatusChange(null);
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
      onResultStatusChange({
        message: "没有读取到有效的源块，迁移未执行。",
        status: "failed",
      });
      finishSourceBlockDrag();
      return;
    }

    setSourceBlockLineNumber(lineNumberValue);
    moveBlockToPosition(lineNumberValue, positionValue);
    finishSourceBlockDrag();
  };

  return (
    <section className="workspace-main-panel migration-workspace-panel" aria-label="跨笔记组分迁移">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Block Migration</p>
          <h2>组分 / 块迁移</h2>
        </div>
        <div className="stats">
          <span>拖拽释放即迁移</span>
        </div>
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
    </section>
  );
}
