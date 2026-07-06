import type { DragEvent } from "react";
import type { UiBlockNode } from "../../../application/workspace/projection/viewBlocks";
import { BlockTree } from "../../shared/blocks/BlockTree";
import { BlockTextDisplay } from "../../shared/blocks/BlockTextDisplay";
import { MigrationDropZone } from "./MigrationTargetTree";

type BlockStructureTreeProps = {
  activeDropPositionValue: string | null;
  activeTargetBlockLineNumber: number | null;
  draggingLineNumber: string | null;
  nodes: UiBlockNode[];
  selectedLineNumbers: ReadonlySet<number>;
  selectedRootLineNumber: number | null;
  onDragEnd: () => void;
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
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    lineNumber: number,
  ) => void;
  onDropPosition: (
    event: DragEvent<HTMLElement>,
    positionValue: string,
  ) => void;
  onSelectBlock: (lineNumber: number) => void;
};

export function BlockStructureTree({
  activeDropPositionValue,
  activeTargetBlockLineNumber,
  draggingLineNumber,
  nodes,
  selectedLineNumbers,
  selectedRootLineNumber,
  onDragEnd,
  onDragLeavePosition,
  onDragOverPosition,
  onDragOverTargetBlock,
  onDragStart,
  onDropPosition,
  onSelectBlock,
}: BlockStructureTreeProps) {
  return (
    <BlockTree
      className="ctn-tree-list migration-tree"
      nodes={nodes}
      renderBlock={({ block, children }) => {
        const insidePositionValue = `inside:${block.lineNumber}`;
        const isDragging = draggingLineNumber === String(block.lineNumber);
        const isSelected = selectedLineNumbers.has(block.lineNumber);
        const isSelectedRoot = selectedRootLineNumber === block.lineNumber;
        const isActiveTarget =
          activeTargetBlockLineNumber === block.lineNumber && !isSelected;

        return (
          <>
            {isActiveTarget ? (
              <MigrationDropZone
                activeDropPositionValue={activeDropPositionValue}
                label="上方并列"
                onDragLeavePosition={onDragLeavePosition}
                onDragOverPosition={onDragOverPosition}
                onDropPosition={onDropPosition}
                positionValue={`sibling-above:${block.lineNumber}`}
              />
            ) : null}
            <div
              className={
                [
                  "migration-tree-node",
                  "ctn-tree-main",
                  "ctn-tree-main-with-meta",
                  "draggable-node",
                  "structure-node",
                  isDragging ? "is-dragging" : "",
                  isSelected ? "is-selected-subtree" : "",
                  isSelectedRoot ? "is-selected-root" : "",
                  isActiveTarget ? "is-position-source is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              draggable
              onClick={() => onSelectBlock(block.lineNumber)}
              onDragEnd={onDragEnd}
              onDragOver={(event) =>
                onDragOverTargetBlock(event, block.lineNumber)
              }
              onDragStart={(event) => onDragStart(event, block.lineNumber)}
              title={`${block.label}: ${block.textDisplay.displayText}`}
            >
              <span className="ctn-tree-kind migration-node-kind">
                {block.label}
              </span>
              <BlockTextDisplay
                className="ctn-tree-text migration-node-text"
                text={block.textDisplay}
              />
              <span className="ctn-tree-meta migration-node-lines">
                {block.lineLabel}
              </span>
            </div>
            {children}
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
                positionValue={`sibling-below:${block.lineNumber}`}
              />
            ) : null}
          </>
        );
      }}
    />
  );
}
