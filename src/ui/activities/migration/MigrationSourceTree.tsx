import type { DragEvent } from "react";
import type { UiBlockNode } from "../../../application/workspace/viewTypes";
import { BlockTree } from "../../shared/blocks/BlockTree";
import { OutlineNodeText } from "../../shared/blocks/OutlineNodeText";

type MigrationSourceTreeProps = {
  draggingLineNumber: string | null;
  nodes: UiBlockNode[];
  onDragEnd: () => void;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    lineNumber: number,
  ) => void;
};

export function MigrationSourceTree({
  draggingLineNumber,
  onDragEnd,
  onDragStart,
  nodes,
}: MigrationSourceTreeProps) {
  return (
    <BlockTree
      className="ctn-tree-list migration-tree"
      nodes={nodes}
      renderBlock={({ block, children }) => {
        const isDragging = draggingLineNumber === String(block.lineNumber);

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
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              draggable
              onDragEnd={onDragEnd}
              onDragStart={(event) => onDragStart(event, block.lineNumber)}
              title={`${block.label}: ${block.textDisplay.displayText}`}
            >
              <span className="ctn-tree-kind migration-node-kind">
                {block.label}
              </span>
              <OutlineNodeText
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
