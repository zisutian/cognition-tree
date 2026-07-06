import type { DragEvent } from "react";
import { useState } from "react";
import {
  flattenUiBlockSubtree,
  getUiTargetPositionLabel,
} from "../../../application/workspace/viewData";
import type {
  UiBlockNode,
  UiNoteSummary,
} from "../../../application/workspace/viewTypes";
import { OutlineNodeText } from "../../shared/blocks/OutlineNodeText";
import {
  blockDragDataType,
  createBlockDragLineNumberPayload,
  readBlockDragLineNumberPayload,
} from "./blockMigrationDrag";
import { MigrationSourceTree } from "./MigrationSourceTree";
import {
  MigrationDropZone,
  MigrationTargetTree,
} from "./MigrationTargetTree";

type BlockMigrationViewProps = {
  onMoveBlockToPosition: (
    sourceBlockLineNumberValue: string,
    targetPositionValue: string,
  ) => void;
  sourceBlocks: UiBlockNode[];
  sourceNote: UiNoteSummary | null;
  sourceRoots: UiBlockNode[];
  targetNote: UiNoteSummary | null;
  targetRoots: UiBlockNode[];
};

export function BlockMigrationView({
  onMoveBlockToPosition,
  sourceBlocks,
  sourceNote,
  sourceRoots,
  targetNote,
  targetRoots,
}: BlockMigrationViewProps) {
  const [sourceBlockLineNumber, setSourceBlockLineNumber] = useState("");
  const [draggingSourceLineNumber, setDraggingSourceLineNumber] =
    useState<string | null>(null);
  const [activeDropPositionValue, setActiveDropPositionValue] =
    useState<string | null>(null);
  const [activeTargetBlockLineNumber, setActiveTargetBlockLineNumber] =
    useState<number | null>(null);
  const isDropMode = draggingSourceLineNumber !== null;
  const sourceBlock =
    sourceBlocks.find(
      (block) => String(block.lineNumber) === sourceBlockLineNumber,
    ) ?? null;
  const sourceSubtreeBlocks = sourceBlock ? flattenUiBlockSubtree(sourceBlock) : [];
  const activeDropLabel = activeDropPositionValue
    ? getUiTargetPositionLabel(activeDropPositionValue)
    : null;

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
    onMoveBlockToPosition(lineNumberValue, positionValue);
    finishSourceBlockDrag();
  };

  return (
    <div className="migration-grid">
      <section className="migration-column">
        <p className="activity-detail-title">
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
          <p className="activity-detail-title">将移动的子树</p>
          {sourceBlock ? (
            <>
              <p>
                {sourceBlock.lineLabel} · {sourceSubtreeBlocks.length} 块
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
                      text={block.textDisplay}
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

      <section className="migration-column">
        <p className="activity-detail-title">
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
          <p className="activity-detail-title">目标插入位置</p>
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
