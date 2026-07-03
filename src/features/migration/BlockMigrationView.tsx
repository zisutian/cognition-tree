import type { DragEvent } from "react";
import { useMemo, useState } from "react";
import type { NoteId } from "../../workspace/model/workspaceData";
import { resolveParsedNoteView } from "../../workspace/view-model/parsedNoteView";
import type { WorkspaceBlockMigrationRequest } from "../../workspace/workflows/blockMigrationWorkflow";
import type { WorkspaceRuntime } from "../../workspace/runtime/workspaceRuntime";
import { OutlineNodeText } from "../blocks/OutlineNodeText";
import {
  blockDragDataType,
  createBlockDragLineNumberPayload,
  parseBlockMigrationTargetPosition,
  readBlockDragLineNumberPayload,
} from "./blockMigrationDrag";
import {
  flattenBlockSubtree,
  getBlockLineLabel,
  getTargetPositionLabel,
} from "./blockMigrationView";
import { MigrationSourceTree } from "./MigrationSourceTree";
import {
  MigrationDropZone,
  MigrationTargetTree,
} from "./MigrationTargetTree";

type MoveNoteBlock = (request: WorkspaceBlockMigrationRequest) => {
  message: string;
  status: "failed" | "moved";
};

type BlockMigrationViewProps = {
  onMoveNoteBlock: MoveNoteBlock;
  sourceNoteId: NoteId;
  targetNoteId: NoteId;
  workspace: WorkspaceRuntime;
};

export function BlockMigrationView({
  onMoveNoteBlock,
  sourceNoteId,
  targetNoteId,
  workspace,
}: BlockMigrationViewProps) {
  const [sourceBlockLineNumber, setSourceBlockLineNumber] = useState("");
  const [draggingSourceLineNumber, setDraggingSourceLineNumber] =
    useState<string | null>(null);
  const [activeDropPositionValue, setActiveDropPositionValue] =
    useState<string | null>(null);
  const [activeTargetBlockLineNumber, setActiveTargetBlockLineNumber] =
    useState<number | null>(null);
  const sourceNote =
    workspace.notes.find((note) => note.id === sourceNoteId) ?? null;
  const targetNote =
    workspace.notes.find((note) => note.id === targetNoteId) ?? null;
  const sourceParsed = useMemo(
    () => (sourceNote ? resolveParsedNoteView(workspace, sourceNote) : null),
    [sourceNote, workspace],
  );
  const targetParsed = useMemo(
    () => (targetNote ? resolveParsedNoteView(workspace, targetNote) : null),
    [targetNote, workspace],
  );
  const sourceBlocks = sourceParsed?.document.blocks ?? [];
  const sourceRoots = sourceParsed?.document.roots ?? [];
  const targetRoots = targetParsed?.document.roots ?? [];
  const isDropMode = draggingSourceLineNumber !== null;
  const sourceBlock =
    sourceBlocks.find(
      (block) => String(block.lineNumber) === sourceBlockLineNumber,
    ) ?? null;
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
      targetPosition: parseBlockMigrationTargetPosition(
        nextTargetPositionValue,
      ),
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
                  <li
                    key={block.id}
                    style={{ paddingLeft: `${block.level * 12}px` }}
                  >
                    <span>{block.label}</span>
                    <OutlineNodeText
                      className="migration-subtree-node-text"
                      node={block}
                    />
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
            <p className="migration-empty-state">
              目标笔记没有结构，当前只能插入文末。
            </p>
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
