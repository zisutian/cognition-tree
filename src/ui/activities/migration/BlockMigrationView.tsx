import type { DragEvent } from "react";
import {
  useMemo,
  useState,
} from "react";
import {
  flattenUiBlockSubtree,
} from "../../../application/workspace/projection/viewBlocks";
import type { UiBlockNode } from "../../../application/workspace/projection/viewBlocks";
import type { UiNoteSummary } from "../../../application/workspace/projection/viewTree";
import {
  UiSectionTitle,
} from "../../shared/primitives";
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
  const sourceSubtreeBlocks = useMemo(
    () => (sourceBlock ? flattenUiBlockSubtree(sourceBlock) : []),
    [sourceBlock],
  );
  const selectedSourceLineNumbers = useMemo(
    () => new Set(sourceSubtreeBlocks.map((block) => block.lineNumber)),
    [sourceSubtreeBlocks],
  );

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
        <UiSectionTitle>
          源 · {sourceNote?.title ?? "—"}
        </UiSectionTitle>
        <div className="migration-tree-panel">
          {sourceRoots.length > 0 ? (
            <MigrationSourceTree
              draggingLineNumber={draggingSourceLineNumber}
              nodes={sourceRoots}
              selectedLineNumbers={selectedSourceLineNumbers}
              selectedRootLineNumber={sourceBlock?.lineNumber ?? null}
              onDragEnd={finishSourceBlockDrag}
              onDragStart={startSourceBlockDrag}
              onSelectBlock={(lineNumber) =>
                setSourceBlockLineNumber(String(lineNumber))
              }
            />
          ) : (
            <p className="ui-muted">源笔记没有可移动块。</p>
          )}
        </div>
      </section>

      <section className="migration-column">
        <UiSectionTitle>
          目标 · {targetNote?.title ?? "—"}
        </UiSectionTitle>
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
            <p className="ui-muted">
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
      </section>
    </div>
  );
}
