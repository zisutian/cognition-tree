import type { DragEvent } from "react";
import type { UiBlockNode } from "../../../application/workspace/projection/viewBlocks";
import { BlockTree } from "../../shared/blocks/BlockTree";
import { BlockTextDisplay } from "../../shared/blocks/BlockTextDisplay";

type MigrationSourceTreeProps = {
  draggingLineNumber: string | null;
  nodes: UiBlockNode[];
  selectedLineNumbers: ReadonlySet<number>;
  selectedRootLineNumber: number | null;
  onDragEnd: () => void;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    lineNumber: number,
  ) => void;
  onSelectBlock: (lineNumber: number) => void;
};

export function MigrationSourceTree({
  draggingLineNumber,
  onDragEnd,
  onDragStart,
  onSelectBlock,
  nodes,
  selectedLineNumbers,
  selectedRootLineNumber,
}: MigrationSourceTreeProps) {
  return (
    <BlockTree
      className="ctn-tree-list migration-tree"
      nodes={nodes}
      renderBlock={({ block, children }) => {
        const isDragging = draggingLineNumber === String(block.lineNumber);
        const isSelected = selectedLineNumbers.has(block.lineNumber);
        const isSelectedRoot = selectedRootLineNumber === block.lineNumber;

        return (
          <>
            <div
              className={
                [
                  "migration-tree-node",
                  "ctn-tree-main",
                  "ctn-tree-main-with-meta",
                  "source-node",
                  isDragging ? "is-dragging" : "",
                  isSelected ? "is-selected-subtree" : "",
                  isSelectedRoot ? "is-selected-root" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              draggable
              onClick={() => onSelectBlock(block.lineNumber)}
              onDragEnd={onDragEnd}
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
          </>
        );
      }}
    />
  );
}
